/**
 * /api/admin/recovery-templates — config dos templates da cadência de
 * recuperação (tela /admin/recovery).
 *
 * Auth: sessão ADMIN OU X-Admin-Secret.
 *
 * GET → lista as 8 chaves da cadência, mesclando defaults (lib/recovery)
 *       com o que está salvo no DB (RecoveryTemplate).
 * PUT → upsert de uma chave: { key, chatproTemplate?, params?, fallbackText?, active? }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/admin-auth";
import {
  TEMPLATE_KEYS,
  TEMPLATE_META,
  DEFAULT_TEMPLATE_TEXTS,
  type TemplateKey,
} from "@/lib/recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const a = await checkAdminAuth(req);
  if (!a.authorized) {
    return NextResponse.json({ error: "unauthorized", reason: a.reason }, { status: 401 });
  }
  let saved: Array<{
    key: string; chatproTemplate: string | null; params: string[];
    fallbackText: string | null; active: boolean; updatedAt: Date;
  }> = [];
  try {
    saved = await prisma.recoveryTemplate.findMany();
  } catch { /* tabela ainda não migrada — retorna só defaults */ }
  const byKey = new Map(saved.map((s) => [s.key, s]));

  const templates = TEMPLATE_KEYS.map((key) => {
    const s = byKey.get(key);
    return {
      key,
      label: TEMPLATE_META[key].label,
      defaultParams: TEMPLATE_META[key].defaultParams,
      defaultText: DEFAULT_TEMPLATE_TEXTS[key],
      chatproTemplate: s?.chatproTemplate ?? null,
      params: s?.params?.length ? s.params : TEMPLATE_META[key].defaultParams,
      fallbackText: s?.fallbackText ?? DEFAULT_TEMPLATE_TEXTS[key],
      active: s?.active ?? true,
      customized: !!s,
      updatedAt: s?.updatedAt ?? null,
    };
  });
  return NextResponse.json({ templates });
}

const PutInput = z.object({
  key: z.string().refine((k): k is TemplateKey => TEMPLATE_KEYS.includes(k as TemplateKey), {
    message: "chave desconhecida",
  }),
  chatproTemplate: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().max(200).nullable().optional()
  ),
  params: z.array(z.enum(["nome", "curso", "link", "cupom"])).max(6).optional(),
  fallbackText: z.string().min(5).max(2000).optional(),
  active: z.boolean().optional(),
});

export async function PUT(req: NextRequest) {
  const a = await checkAdminAuth(req);
  if (!a.authorized) {
    return NextResponse.json({ error: "unauthorized", reason: a.reason }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = PutInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const d = parsed.data;
  try {
    const row = await prisma.recoveryTemplate.upsert({
      where: { key: d.key },
      create: {
        key: d.key,
        chatproTemplate: d.chatproTemplate ?? null,
        params: d.params ?? TEMPLATE_META[d.key as TemplateKey].defaultParams,
        fallbackText: d.fallbackText ?? DEFAULT_TEMPLATE_TEXTS[d.key as TemplateKey],
        active: d.active ?? true,
      },
      update: {
        ...(d.chatproTemplate !== undefined ? { chatproTemplate: d.chatproTemplate } : {}),
        ...(d.params !== undefined ? { params: d.params } : {}),
        ...(d.fallbackText !== undefined ? { fallbackText: d.fallbackText } : {}),
        ...(d.active !== undefined ? { active: d.active } : {}),
      },
    });
    return NextResponse.json({ status: "saved", template: row });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "db_error", message: msg }, { status: 500 });
  }
}
