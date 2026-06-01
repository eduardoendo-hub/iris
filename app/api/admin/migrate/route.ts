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

async function appliedNames(): Promise<Set<string>> {
  const rows = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
    `SELECT migration_name FROM "_prisma_migrations"`,
  );
  return new Set(rows.map((r) => r.migration_name));
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
    return NextResponse.json({ total: all.length, applied: all.length - pending.length, pending });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "introspect_failed", message: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let dir: string;
  let pending: string[];
  try {
    dir = migrationsDir();
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

  return NextResponse.json({ status: "ok", appliedNow: results.length, results });
}
