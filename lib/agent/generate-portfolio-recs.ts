/**
 * generate-portfolio-recs — o "Gestor de Tráfego IA". Recebe o snapshot da
 * carteira (todas as campanhas rastreadas) e gera a lista priorizada de ações
 * ("o que fazer hoje") gravando em AgentRecommendation.
 *
 * Reaproveita o padrão do generate-insight: system prompt com persona +
 * knowledge base (gestor-trafego-playbook.md) cacheada, output via json_schema.
 *
 * Idempotente por dia: re-rodar substitui as recomendações OPEN do dia
 * (preserva as que o humano marcou DONE/DISMISSED).
 */
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { PortfolioSnapshot, IrisCampaignBlock, PlatformChild } from "./collect-portfolio-data";

const MODEL = "claude-opus-4-7"; // mesmo do analista diário (já validado em prod)

let _kb: string | null = null;
function loadKnowledge(): string {
  if (_kb) return _kb;
  const dir = fs.existsSync(path.join(process.cwd(), "lib", "agent", "knowledge"))
    ? path.join(process.cwd(), "lib", "agent", "knowledge")
    : path.join("/app", "lib", "agent", "knowledge");
  const files = ["impacta-context.md", "gestor-trafego-playbook.md"];
  const parts: string[] = [];
  for (const f of files) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) parts.push(`# === ${f} ===\n\n${fs.readFileSync(p, "utf8")}`);
  }
  _kb = parts.join("\n\n---\n\n");
  return _kb;
}

const SYSTEM_HEAD = `Você é o Gestor de Tráfego Pago da Impacta — um engenheiro de receita, não só media buyer. Recebe o snapshot do dia com TODAS as campanhas ativas (Meta + Google), métricas dos últimos 7 dias por campanha (spend, impressões, cliques, CTR, CPC) e, quando o utm_campaign está cadastrado, o funil da LP (visitas, leads, CPL real vs meta).

Sua tarefa: entregar as AÇÕES que mais importam HOJE, priorizadas por impacto no resultado. NÃO é relatório — é direção concreta e executável nas próximas 24h.

PRINCÍPIOS (detalhe no knowledge base abaixo):
- Cada ação DEVE citar o número que a justifica (spend, CPL, CTR, tendência).
- Compare cada campanha contra (a) a meta dela (targetCpl) e (b) a mediana da carteira — nunca contra média de indústria cega.
- Decisão por evidência: não recomende escalar com <200 cliques nem matar com <1.000 impressões. Reconheça incerteza quando o volume é baixo ou faltam dias de dado.
- Uma variável por vez. No Meta, subir budget >20% reseta a fase de aprendizado — escale 10–20%.
- Sangria de budget (gasto sem retorno) é prioridade #1: PAUSE + realocar.
- Quando faltar dado (ex: campanha sem utm_campaign, sem CPL), DIGA o que falta em vez de inventar.

CATEGORIAS válidas: PAUSE, SCALE, REALLOCATE, BID, NEGATIVE, CREATIVE, TRACKING, ALERT.
PRIORIDADES válidas: CRITICAL, HIGH, MEDIUM, LOW.
SCOPE válido: PORTFOLIO (carteira toda), CAMPAIGN (uma campanha), KEYWORD (futuro).

FORMATO DE TEXTO: português, texto puro, SEM markdown (sem **, *, #, listas com -). Direto e técnico, sem clichês de marketing.

KNOWLEDGE BASE A SEGUIR — contexto Impacta + playbook completo de tráfego. Use pra calibrar tudo.

---

`;

const SYSTEM_TAIL = `\n\n---\n\nOUTPUT: JSON estruturado conforme schema. Gere de 1 a 6 recomendações (qualidade > quantidade — só o que importa hoje). Cada recomendação:

- scope: "PORTFOLIO" | "CAMPAIGN" | "KEYWORD"
- platform: "META" | "GOOGLE" | "" (string vazia se for PORTFOLIO geral)
- campaignRef: nome/label da campanha alvo, ou "" (string vazia)
- entityRef: keyword/anúncio alvo, ou "" (string vazia)
- priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
- category: "PAUSE" | "SCALE" | "REALLOCATE" | "BID" | "NEGATIVE" | "CREATIVE" | "TRACKING" | "ALERT"
- problem: o problema COM o número que o justifica (texto puro). Ex: "Corp PJ Meta gastou R$ 92 em 7d e gerou 0 lead (mediana da carteira: CPL R$ 28)."
- action: a ação concreta e executável em menos de 60min (texto puro). Ex: "Pausar a campanha Corp PJ e realocar os R$ 13/dia pra Hub Search G1, que está com CPL R$ 13 (meta 30)."
- expectedImpact: efeito esperado quantificado (texto puro), ou "" (string vazia). Ex: "Recupera ~R$ 90/semana de budget e deve gerar +3 leads/semana no mesmo gasto."
- evidence: TEXTO curto com os números-chave que embasam (ou "" se não houver). Ex: "spend7d R$ 92, leads 0, mediana CPL R$ 28".

REGRAS:
- Se a carteira está saudável e não há movimento que valha a pena, gere 1 recomendação de "manter e observar X por mais 24h".
- Nunca gere ação "pra encher". Padding é pior que silêncio.
- Se faltam dados (sem utm_campaign, poucos dias), gere uma recomendação TRACKING dizendo o que cadastrar/esperar — não chute CPL.`;

type RecOutput = {
  recommendations: Array<{
    scope: string;
    platform: string;
    campaignRef: string;
    entityRef: string;
    priority: string;
    category: string;
    problem: string;
    action: string;
    expectedImpact: string;
    evidence: string;
  }>;
};

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    recommendations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          scope: { type: "string", enum: ["PORTFOLIO", "CAMPAIGN", "KEYWORD"] },
          platform: { type: "string", enum: ["META", "GOOGLE", ""] },
          campaignRef: { type: "string" },
          entityRef: { type: "string" },
          priority: { type: "string", enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] },
          category: { type: "string", enum: ["PAUSE", "SCALE", "REALLOCATE", "BID", "NEGATIVE", "CREATIVE", "TRACKING", "ALERT"] },
          problem: { type: "string" },
          action: { type: "string" },
          expectedImpact: { type: "string" },
          evidence: { type: "string" },
        },
        required: ["scope", "platform", "campaignRef", "entityRef", "priority", "category", "problem", "action", "expectedImpact", "evidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["recommendations"],
  additionalProperties: false,
} as const;

const fmtBRL = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
const fmtNum = (n: number) => new Intl.NumberFormat("pt-BR").format(Math.round(n));

function childLine(c: PlatformChild): string {
  const trend = c.spendPrev7d > 0 ? `${c.spendTrendPct >= 0 ? "+" : ""}${c.spendTrendPct.toFixed(0)}% vs 7d ant.` : "novo";
  const leadPart = c.leads7d != null ? ` · leads ${fmtNum(c.leads7d)} · CPL ${c.cpl7d != null ? fmtBRL(c.cpl7d) : "—"}` : "";
  return `    • [${c.platform}] ${c.label}${c.campaignName ? ` (${c.campaignName})` : ""} · ${c.daysWithData}d dado
        spend7d ${fmtBRL(c.spend7d)} (${trend}) · impr ${fmtNum(c.impressions7d)} · cliq ${fmtNum(c.clicks7d)} · CTR ${c.ctr7d.toFixed(2)}% · CPC ${fmtBRL(c.cpc7d)}${leadPart}`;
}

function campaignBlock(b: IrisCampaignBlock): string {
  const cpl = b.cpl7d != null ? fmtBRL(b.cpl7d) : b.leads7d === 0 ? "sem leads" : "—";
  const goal = b.goalCpl != null ? `goalCPL ${fmtBRL(b.goalCpl)}` : "sem goalCPL";
  const vsGoal = b.cplVsGoalPct != null ? ` · ${b.cplVsGoalPct >= 0 ? "+" : ""}${b.cplVsGoalPct.toFixed(0)}% vs meta` : "";
  return `- CAMPANHA IRIS "${b.name}" [${b.productSlug} · ${b.status}]
    Total 7d: spend ${fmtBRL(b.spend7d)} · visitas ${fmtNum(b.visits7d)} · leads ${fmtNum(b.leads7d)} · CPL ${cpl} (${goal})${vsGoal} · conv ${b.convVisitLead != null ? b.convVisitLead.toFixed(1) + "%" : "—"}
    Mídia atrelada:
${b.children.map(childLine).join("\n")}`;
}

function buildUserPrompt(s: PortfolioSnapshot): string {
  const t = s.totals;
  const m = s.medians;
  return `# CARTEIRA DE TRÁFEGO — ${s.analysisDate}

## VISÃO GERAL (7 dias)
Campanhas IRIS ativas: ${t.irisCampaigns} (${t.platformCampaigns} campanhas de mídia)
Spend total 7d: ${fmtBRL(t.spend7d)} (Meta ${fmtBRL(t.metaSpend7d)} + Google ${fmtBRL(t.googleSpend7d)})
Leads 7d: ${fmtNum(t.leads7d)} · CPL combinado: ${t.blendedCpl != null ? fmtBRL(t.blendedCpl) : "—"}
Medianas: CPL/campanha-IRIS ${m.cplIris7d != null ? fmtBRL(m.cplIris7d) : "—"} · CTR ${m.ctr7d != null ? m.ctr7d.toFixed(2) + "%" : "—"} · CPC ${m.cpc7d != null ? fmtBRL(m.cpc7d) : "—"}

## CAMPANHAS (agrupadas por campanha da IRIS; a mídia atrelada vem indentada)
${s.campaigns.length === 0 ? "(nenhuma campanha IRIS ativa com mídia vinculada)" : s.campaigns.map(campaignBlock).join("\n\n")}

## OBSERVAÇÕES DO SISTEMA (dados faltando / a cadastrar)
${s.notes.length === 0 ? "(nenhuma)" : s.notes.map((n) => `- ${n}`).join("\n")}

---

Gere AGORA a lista priorizada de ações do dia ${s.analysisDate} no formato JSON. Foque no que move resultado nas próximas 24h. Cite os números. Se faltar dado, diga o que cadastrar.`;
}

export async function generatePortfolioRecs(opts: {
  snapshot: PortfolioSnapshot;
  apiKey?: string;
  dryRun?: boolean;
}): Promise<{
  outcome: "created" | "dry_run" | "error";
  count?: number;
  recommendations?: RecOutput["recommendations"];
  reason?: string;
  tokensIn?: number;
  tokensOut?: number;
}> {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { outcome: "error", reason: "ANTHROPIC_API_KEY nao configurada" };

  const knowledge = loadKnowledge();
  const userPrompt = buildUserPrompt(opts.snapshot);

  if (opts.dryRun) {
    return { outcome: "dry_run", reason: `system=${(SYSTEM_HEAD + knowledge + SYSTEM_TAIL).length} chars, user=${userPrompt.length} chars, campanhas=${opts.snapshot.campaigns.length}` };
  }

  const client = new Anthropic({ apiKey });
  let resp;
  try {
    resp = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: [
        { type: "text", text: SYSTEM_HEAD },
        { type: "text", text: knowledge, cache_control: { type: "ephemeral", ttl: "1h" } },
        { type: "text", text: SYSTEM_TAIL },
      ],
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      messages: [{ role: "user", content: userPrompt }],
    });
  } catch (err) {
    return { outcome: "error", reason: `anthropic_api_error: ${err instanceof Error ? err.message : String(err)}` };
  }

  const textBlock = resp.content.find((b) => b.type === "text") as { type: "text"; text: string } | undefined;
  if (!textBlock) return { outcome: "error", reason: "no_text_block" };

  let out: RecOutput;
  try {
    out = JSON.parse(textBlock.text) as RecOutput;
  } catch (err) {
    return { outcome: "error", reason: `json_parse_failed: ${err instanceof Error ? err.message : String(err)} / raw=${textBlock.text.slice(0, 200)}` };
  }
  if (!Array.isArray(out.recommendations)) {
    return { outcome: "error", reason: "recommendations_not_array" };
  }

  // Idempotência por dia: limpa OPEN do dia (preserva DONE/DISMISSED do humano).
  const dayStart = new Date(opts.snapshot.analysisDate + "T03:00:00.000Z"); // SP midnight
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  try {
    await prisma.agentRecommendation.deleteMany({
      where: { date: { gte: dayStart, lt: dayEnd }, status: "OPEN" },
    });
    if (out.recommendations.length > 0) {
      await prisma.agentRecommendation.createMany({
        data: out.recommendations.map((r) => ({
          date: dayStart,
          scope: r.scope,
          platform: r.platform || null,
          campaignRef: r.campaignRef || null,
          entityRef: r.entityRef || null,
          priority: r.priority,
          category: r.category,
          problem: r.problem,
          action: r.action,
          expectedImpact: r.expectedImpact || null,
          evidence: r.evidence ? { nota: r.evidence } : undefined,
          status: "OPEN",
        })),
      });
    }
  } catch (err) {
    return { outcome: "error", reason: `db_save_failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  return {
    outcome: "created",
    count: out.recommendations.length,
    recommendations: out.recommendations,
    tokensIn: resp.usage.input_tokens,
    tokensOut: resp.usage.output_tokens,
  };
}
