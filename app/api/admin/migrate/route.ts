/**
 * /api/admin/migrate — aplica migrações Prisma PENDENTES sem o CLI.
 *
 * Existe porque o build standalone do Next não traz o prisma CLI e o deploy no
 * Coolify não roda `prisma migrate deploy` automaticamente (ver Dockerfile).
 * Quando não há acesso ao terminal do container, esta rota aplica as migrações
 * em ./prisma/migrations que ainda NÃO estão em _prisma_migrations, usando o
 * cliente Prisma já presente no runtime.
 *
 * SEGURO p/ rodar repetidamente: só toca o que está pendente e registra em
 * _prisma_migrations com o checksum correto (compatível com o CLI depois).
 * NÃO re-executa migrações de dados já aplicadas (evita dupla aplicação de DML).
 *
 * Auth: header X-Cron-Secret = CRON_SECRET  (ou X-Admin-Secret = IRIS_WEBHOOK_SECRET)
 * GET  → dry-run: lista aplicadas vs pendentes
 * POST → aplica as pendentes, cada uma numa transação atômica
 */
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const cron = process.env.CRON_SECRET;
  const admin = process.env.IRIS_WEBHOOK_SECRET;
  const xc = req.headers.get("x-cron-secret") || "";
  const xa = req.headers.get("x-admin-secret") || "";
  return (!!cron && xc === cron) || (!!admin && xa === admin);
}

function migrationsDir(): string {
  const candidates = [
    path.join(process.cwd(), "prisma", "migrations"),
    path.join("/app", "prisma", "migrations"),
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir) && fs.readdirSync(dir).some((i) => /^\d{14}_/.test(i))) return dir;
    } catch {}
  }
  return candidates[0];
}

function listMigrationNames(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((i) => /^\d{14}_/.test(i) && fs.existsSync(path.join(dir, i, "migration.sql")))
    .sort();
}

// DDL padrao do Prisma p/ a tabela de controle. IF NOT EXISTS = idempotente.
// Necessario p/ o BASELINE: o banco de prod nunca teve _prisma_migrations
// (schema foi criado via db push / rota antiga de SQL cru), entao a 1a vez
// que rodamos aqui precisamos materializar a tabela antes de registrar nada.
async function ensureMigrationsTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
    )`);
}

// Le os nomes ja registrados. Tolera a tabela ausente (42P01) retornando
// vazio — assim o GET dry-run continua read-only mesmo num banco sem baseline.
async function appliedNames(): Promise<Set<string>> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
      `SELECT migration_name FROM "_prisma_migrations"`,
    );
    return new Set(rows.map((r) => r.migration_name));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/_prisma_migrations/.test(msg) && /(does not exist|42P01)/.test(msg)) {
      return new Set();
    }
    throw err;
  }
}

// Registra uma migracao no controle SEM rodar o SQL. Usado no baseline p/
// marcar as historicas (schema ja existe no banco) como aplicadas.
async function recordMigration(name: string, checksum: string, steps: number): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "_prisma_migrations"
      (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
    VALUES (${randomUUID()}, ${checksum}, now(), ${name}, now(), ${steps})`;
}

// Remove comentários de linha (-- ...) e quebra em statements por ';'.
// Vale só p/ DDL/DML simples (sem stored procedures com ';' interno).
function splitStatements(sql: string): string[] {
  const noComments = sql
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join("\n");
  return noComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const dir = migrationsDir();
    const all = listMigrationNames(dir);
    const applied = await appliedNames();
    const pending = all.filter((n) => !applied.has(n));
    return NextResponse.json({
      total: all.length,
      applied: all.length - pending.length,
      pending,
      hasMigrationsTable: applied.size > 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "introspect_failed", message: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // ?baselineUpTo=<migration_name>: migracoes pendentes com nome <= esse valor
  // sao apenas REGISTRADAS (sem rodar SQL), porque o schema ja existe no banco.
  // As com nome > esse valor rodam de verdade. Sem o param = tudo roda de verdade.
  const baselineUpTo = new URL(req.url).searchParams.get("baselineUpTo") || "";

  let dir: string;
  let pending: string[];
  try {
    dir = migrationsDir();
    await ensureMigrationsTable();
    const all = listMigrationNames(dir);
    const applied = await appliedNames();
    pending = all.filter((n) => !applied.has(n));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "introspect_failed", message: msg }, { status: 500 });
  }

  const results: Array<{ migration: string; statements: number; status: string }> = [];

  for (const name of pending) {
    const sql = fs.readFileSync(path.join(dir, name, "migration.sql"), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");

    // Baseline: so registra, nao executa (schema historico ja esta no banco).
    if (baselineUpTo && name <= baselineUpTo) {
      try {
        await recordMigration(name, checksum, 0);
        results.push({ migration: name, statements: 0, status: "baselined" });
        continue;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ migration: name, statements: 0, status: `FAILED: ${msg}` });
        return NextResponse.json(
          { status: "aborted", baselinedNow: results.filter((r) => r.status === "baselined").length, results },
          { status: 500 },
        );
      }
    }

    const statements = splitStatements(sql);
    try {
      await prisma.$transaction(async (tx) => {
        for (const stmt of statements) {
          await tx.$executeRawUnsafe(stmt);
        }
        await tx.$executeRaw`
          INSERT INTO "_prisma_migrations"
            (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
          VALUES (${randomUUID()}, ${checksum}, now(), ${name}, now(), ${statements.length})`;
      });
      results.push({ migration: name, statements: statements.length, status: "applied" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ migration: name, statements: statements.length, status: `FAILED: ${msg}` });
      return NextResponse.json(
        { status: "aborted", appliedNow: results.filter((r) => r.status === "applied").length, results },
        { status: 500 },
      );
    }
  }

  const baselined = results.filter((r) => r.status === "baselined").length;
  const applied = results.filter((r) => r.status === "applied").length;
  return NextResponse.json({ status: "ok", baselinedNow: baselined, appliedNow: applied, results });
}
