/**
 * POST /api/admin/migrate — aplica a migration inicial diretamente via Prisma.
 *
 * Usado quando o `prisma migrate deploy` no boot do container nao funciona
 * (deps faltando) e o terminal do Coolify nao conecta. Le o SQL do arquivo
 * de migration e executa statement-por-statement via $executeRawUnsafe.
 *
 * Protegido por header X-Admin-Secret = process.env.IRIS_WEBHOOK_SECRET
 * (reusa o secret ja configurado).
 *
 * Idempotente: cada CREATE TABLE/TYPE/INDEX usa IF NOT EXISTS quando possivel,
 * e errors de "already exists" sao logados como warning, nao falham a request.
 */
import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.IRIS_WEBHOOK_SECRET;
  if (!secret) return false;
  const provided = req.headers.get("x-admin-secret") || "";
  return provided === secret;
}

function findAllMigrationFiles(): { name: string; path: string }[] {
  // O Dockerfile copia prisma/ para o root do runtime
  const candidates = [
    path.join(process.cwd(), "prisma", "migrations"),
    path.join("/app", "prisma", "migrations"),
  ];
  for (const dir of candidates) {
    try {
      const items = fs.readdirSync(dir);
      // pega todas as pastas de migration (timestamp_name) ordenadas
      const migrations = items
        .filter((i) => /^\d{14}_/.test(i))
        .sort()
        .map((name) => ({
          name,
          path: path.join(dir, name, "migration.sql"),
        }))
        .filter((m) => fs.existsSync(m.path));
      if (migrations.length > 0) return migrations;
    } catch {}
  }
  return [];
}

function splitStatements(sql: string): string[] {
  // 1) Remove linhas de comentario SQL (--...) — Prisma gera "-- CreateTable" antes de cada CREATE
  const cleaned = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  // 2) Split por ';' (com whitespace/newline opcional). Funciona pra DDL puro
  //    (sem stored procedures com ';' interno). Nossa migration so tem CREATE/ALTER simples.
  return cleaned
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const migrations = findAllMigrationFiles();
  if (migrations.length === 0) {
    return NextResponse.json(
      { error: "migration_files_not_found", searched: ["prisma/migrations/*/migration.sql"] },
      { status: 500 }
    );
  }

  type StmtResult = { idx: number; status: "ok" | "skipped" | "error"; preview: string; error?: string };
  type MigResult = { migration: string; total: number; ok: number; skipped: number; errors: number; errorDetails?: StmtResult[] };

  const migResults: MigResult[] = [];

  for (const mig of migrations) {
    const sql = fs.readFileSync(mig.path, "utf8");
    const statements = splitStatements(sql);
    const results: StmtResult[] = [];
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const preview = stmt.slice(0, 80).replace(/\s+/g, " ");
      try {
        await prisma.$executeRawUnsafe(stmt);
        results.push({ idx: i, status: "ok", preview });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/already exists|duplicate/i.test(msg)) {
          results.push({ idx: i, status: "skipped", preview, error: msg.slice(0, 200) });
        } else {
          results.push({ idx: i, status: "error", preview, error: msg.slice(0, 500) });
        }
      }
    }
    const ok = results.filter((r) => r.status === "ok").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const errors = results.filter((r) => r.status === "error").length;
    migResults.push({
      migration: mig.name,
      total: statements.length,
      ok, skipped, errors,
      errorDetails: errors > 0 ? results.filter((r) => r.status === "error") : undefined,
    });
  }

  return NextResponse.json({ migrations: migResults });
}

export async function GET() {
  return NextResponse.json({
    info: "POST com header X-Admin-Secret para aplicar todas migrations",
    migrations: findAllMigrationFiles().map((m) => m.name),
  });
}
