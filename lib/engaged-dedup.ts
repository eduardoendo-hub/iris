/**
 * engaged-dedup — logica compartilhada pra "promover" EngagedPurchase
 * pra PAID quando o cliente paga (seja via webhook .paid do Engaged ou
 * via venda manual cadastrada pelo consultor).
 *
 * Match por (prioridade alta → baixa):
 *   1. Email exato (normalizado: lower + trim)
 *   2. Telefone — ultimos 8 digitos batem (ignora codigo de pais/area)
 *   3. Nome aproximado: ambos com 2+ tokens E pelo menos 2 tokens em
 *      comum (sem acento, lower). Conservador pra evitar falso positivo
 *      com nomes comuns.
 *
 * Usa Prisma. Best-effort (nao quebra fluxo se falhar) — quem chama
 * registra o resultado no log proprio.
 */
import { prisma } from "@/lib/prisma";

export function normalizeEmail(e: string | null | undefined): string | null {
  if (!e) return null;
  const t = e.trim().toLowerCase();
  return t.length > 0 ? t : null;
}

export function normalizePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

/** Retorna os ultimos 8 digitos pra comparar telefones cross-formato */
export function phoneTail(p: string | null | undefined): string | null {
  const norm = normalizePhone(p);
  return norm ? norm.slice(-8) : null;
}

/** Tokeniza nome: lower, remove acento, split por espacos, descarta tokens com <3 chars */
export function nameTokens(n: string | null | undefined): string[] {
  if (!n) return [];
  return n
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3); // descarta "de", "da", iniciais, etc
}

export type Person = {
  customerEmail: string | null;
  customerPhone: string | null;
  customerName: string | null;
};

/**
 * Retorna true se o lead provavelmente eh a MESMA pessoa que o target.
 * Usado pra decidir se uma EngagedPurchase "lead" deve ser promovida pra
 * PAID quando uma Sale ou outra EngagedPurchase=PAID aparece.
 */
export function isSamePerson(lead: Person, target: Person): boolean {
  // 1. Email exato
  const le = normalizeEmail(lead.customerEmail);
  const te = normalizeEmail(target.customerEmail);
  if (le && te && le === te) return true;

  // 2. Telefone — ultimos 8 digitos
  const lp = phoneTail(lead.customerPhone);
  const tp = phoneTail(target.customerPhone);
  if (lp && tp && lp === tp) return true;

  // 3. Nome aproximado — ambos com 2+ tokens E 2+ tokens em comum
  const ln = nameTokens(lead.customerName);
  const tn = nameTokens(target.customerName);
  if (ln.length >= 2 && tn.length >= 2) {
    const tnSet = new Set(tn);
    const overlap = ln.filter((t) => tnSet.has(t)).length;
    if (overlap >= 2) return true;
  }
  return false;
}

/**
 * Para um cliente que acabou de pagar (sale OR engaged purchase PAID),
 * marca todas as EngagedPurchase candidatas como PAID. Retorna lista
 * de ids promovidos pra logging.
 *
 * @param productSlug — escopo (so promove dentro do mesmo produto)
 * @param target — dados do cliente que pagou
 * @param excludeIds — engagedPurchase ids ja sabidos como PAID (nao
 *   reprocessar)
 * @param reason — texto pra anexar em lastEventType (auditoria)
 */
export async function promoteSiblingLeadsToPaid(opts: {
  productSlug: string;
  target: Person;
  excludeIds?: string[];
  reason?: string;
}): Promise<{ promotedIds: string[]; matchedBy: Array<{ id: string; match: string }> }> {
  const { productSlug, target, excludeIds = [], reason = "auto-promoted" } = opts;

  // Sem nenhum identificador, nao tem como matchar
  const hasEmail = !!normalizeEmail(target.customerEmail);
  const hasPhone = !!phoneTail(target.customerPhone);
  const hasName = nameTokens(target.customerName).length >= 2;
  if (!hasEmail && !hasPhone && !hasName) {
    return { promotedIds: [], matchedBy: [] };
  }

  // Carrega candidatos: todos non-PAID do produto. N pequeno (campanha
  // ativa tipicamente <1000 leads), filtragem em app evita SQL complexo.
  const candidates = await prisma.engagedPurchase.findMany({
    where: {
      productSlug,
      status: { not: "PAID" },
      ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
    },
    select: {
      id: true,
      customerEmail: true,
      customerPhone: true,
      customerName: true,
    },
  });

  const matched: Array<{ id: string; match: string }> = [];
  for (const c of candidates) {
    if (!isSamePerson(c, target)) continue;
    // Classifica como bateu (email / phone / name) pro audit log
    let match = "name";
    const le = normalizeEmail(c.customerEmail);
    const te = normalizeEmail(target.customerEmail);
    if (le && te && le === te) match = "email";
    else {
      const lp = phoneTail(c.customerPhone);
      const tp = phoneTail(target.customerPhone);
      if (lp && tp && lp === tp) match = "phone";
    }
    matched.push({ id: c.id, match });
  }

  if (matched.length === 0) return { promotedIds: [], matchedBy: [] };

  await prisma.engagedPurchase.updateMany({
    where: { id: { in: matched.map((m) => m.id) } },
    data: {
      status: "PAID",
      lastEventType: `paid (${reason})`,
      eventAt: new Date(),
    },
  });

  return { promotedIds: matched.map((m) => m.id), matchedBy: matched };
}
