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

function findMigrationFile(): string | null {
  // O Dockerfile copia prisma/ para o root do runtime
  const candidates = [
    path.join(process.cwd(), "prisma", "migrations"),
    path.join("/app", "prisma", "migrations"),
  ];
  for (const dir of candidates) {
    try {
      const items = fs.readdirSync(dir);
      const migrationDir = items.find((i) => /^\d+_init$/.test(i));
      if (migrationDir) {
        const sqlPath = path.join(dir, migrationDir, "migration.sql");
        if (fs.existsSync(sqlPath)) return sqlPath;
      }
    } catch {}
  }
  return null;
}

function splitStatements(sql: string): string[] {
  // Split por ';' final-de-linha. Funciona pra DDL puro (sem stored procedures
  // com ';' interno). Nossa migration so tem CREATE/ALTER simples — seguro.
  return sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("--"));
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sqlPath = findMigrationFile();
  if (!sqlPath) {
    return NextResponse.json(
      { error: "migration_file_not_found", searched: ["prisma/migrations/*_init/migration.sql"] },
      { status: 500 }
    );
  }

  const sql = fs.readFileSync(sqlPath, "utf8");
  const statements = splitStatements(sql);

  const results: Array<{ idx: number; status: "ok" | "skipped" | "error"; preview: string; error?: string }> = [];
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.slice(0, 80).replace(/\s+/g, " ");
    try {
      await prisma.$executeRawUnsafe(stmt);
      results.push({ idx: i, status: "ok", preview });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Erros de "already exists" sao OK (idempotencia)
      if (/already exists|duplicate/i.test(msg)) {
        results.push({ idx: i, status: "skipped", preview, error: msg.slice(0, 200) });
      } else {
        results.push({ idx: i, status: "error", preview, error: msg.slice(0, 500) });
      }
    }
  }

  const okCount = results.filter((r) => r.status === "ok").length;
  const skippedCount = results.filter((r) => r.status === "skipped").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  return NextResponse.json({
    sqlFile: sqlPath,
    totalStatements: statements.length,
    ok: okCount,
    skipped: skippedCount,
    errors: errorCount,
    details: errorCount > 0 ? results.filter((r) => r.status === "error") : undefined,
  });
}

export async function GET() {
  return NextResponse.json({
    info: "POST com header X-Admin-Secret para aplicar migration",
    sqlFile: findMigrationFile(),
  });
}
