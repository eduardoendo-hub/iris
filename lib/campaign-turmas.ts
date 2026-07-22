/**
 * campaign-turmas — schema Zod + sync das turmas paralelas de uma campanha.
 *
 * Usado pelos endpoints admin (create/update/clone de campanha). A UI manda
 * o array completo de turmas; o sync faz replace-all por `key`:
 *   - turma que sumiu do array → deletada
 *   - turma nova → criada
 *   - turma existente → atualizada (label/cor/sharedIds/impactaTurmaId/ordem)
 *
 * `key` é o carimbo gravado em Sale.turmaKey/EngagedPurchase.turmaKey — a UI
 * não deve renomear keys de turmas que já têm vendas (o label pode mudar
 * livremente; a key não).
 */
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const TurmaInputSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "key deve ser slug (a-z, 0-9, hífen)"),
  label: z.string().min(1).max(80),
  color: z.preprocess((v) => (v === "" ? null : v), z.string().max(20).nullish()),
  engagedSharedIds: z.array(z.string().min(1)).default([]),
  engagedProductIds: z.array(z.string().min(1)).default([]),
  impactaTurmaId: z.preprocess((v) => (v === "" ? null : v), z.string().max(40).nullish()),
  ordem: z.coerce.number().int().optional(),
});
export type TurmaInput = z.infer<typeof TurmaInputSchema>;

/** Replace-all das turmas da campanha (transação). */
export async function syncCampaignTurmas(campaignId: string, turmas: TurmaInput[]) {
  const keys = turmas.map((t) => t.key);
  await prisma.$transaction([
    prisma.campaignTurma.deleteMany({
      where: { campaignId, ...(keys.length > 0 ? { key: { notIn: keys } } : {}) },
    }),
    ...turmas.map((t, i) =>
      prisma.campaignTurma.upsert({
        where: { campaignId_key: { campaignId, key: t.key } },
        create: {
          campaignId,
          key: t.key,
          label: t.label,
          color: t.color ?? null,
          engagedSharedIds: t.engagedSharedIds,
          engagedProductIds: t.engagedProductIds,
          impactaTurmaId: t.impactaTurmaId ?? null,
          ordem: t.ordem ?? i,
        },
        update: {
          label: t.label,
          color: t.color ?? null,
          engagedSharedIds: t.engagedSharedIds,
          engagedProductIds: t.engagedProductIds,
          impactaTurmaId: t.impactaTurmaId ?? null,
          ordem: t.ordem ?? i,
        },
      })
    ),
  ]);
}
