/**
 * generate-insight — chama Claude (Opus 4.7 com adaptive thinking) pra gerar
 * análise estratégica diária do tráfego da campanha.
 *
 * Estrutura:
 *   - System prompt: persona + knowledge base (4 markdowns) cacheado com
 *     prompt caching de 1h TTL. Reutilizado em backfills sequenciais.
 *   - User prompt: snapshot do dia anterior em formato estruturado.
 *   - Adaptive thinking ligado — modelo decide quanto pensar.
 *   - Output via output_config.format (json_schema) — JSON validado.
 *
 * Modelo: claude-opus-4-7 (escolha deliberada — análise estratégica precisa
 * de máxima inteligência; custo ~$0.10/análise/dia eh trivial vs o valor).
 */
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { DailySnapshot } from "./collect-daily-data";

const PROMPT_VERSION = "v1";
const MODEL = "claude-opus-4-7";

let cachedKnowledgeBase: string | null = null;
function loadKnowledgeBase(): string {
  if (cachedKnowledgeBase) return cachedKnowledgeBase;
  const dir = path.join(process.cwd(), "lib", "agent", "knowledge");
  const altDir = path.join("/app", "lib", "agent", "knowledge");
  const baseDir = fs.existsSync(dir) ? dir : altDir;
  const files = ["impacta-context.md", "claude-pro-product.md", "campaign-plan.md", "traffic-best-practices.md"];
  const parts = files.map((f) => {
    const p = path.join(baseDir, f);
    return `# === ${f} ===\n\n${fs.readFileSync(p, "utf8")}`;
  });
  cachedKnowledgeBase = parts.join("\n\n---\n\n");
  return cachedKnowledgeBase;
}

const SYSTEM_PROMPT_HEAD = `Você é um **gestor de tráfego sênior** especializado em Meta Ads e Google Ads, com 10+ anos em campanhas de educação executiva no Brasil. Você foi contratado pela Impacta Treinamentos pra analisar diariamente a performance da campanha do Curso Claude Pro e dar direção estratégica concreta — não relatórios genéricos.

Seu trabalho TODO DIA:
1. Receber dados do dia anterior (captação, mídia, vendas) + histórico de 7 dias + insights anteriores
2. Identificar o que está funcionando, o que está quebrado, o que é ruído
3. Recomendar 3–5 ações **específicas, priorizadas e quantificadas** que o time deve executar nas próximas 24h
4. Comparar com targets do plano de marketing (CAC R$ 300, ROAS 5x, 30 matrículas em 4 semanas, R$ 9k budget total)

PRINCÍPIOS:
- **Decisão por evidência** — não recomende escalar criativo com <200 cliques nem matar com <1.000 impressões
- **Uma variável por vez** — não acumule "troca criativo + mexe público + ajusta copy"
- **Quantifique impacto esperado** ("reduzir CPL pra R$ 50 = matrículas 12→18")
- **Reconheça incerteza** quando volume é baixo
- **Tom direto e técnico** — sem clichês de marketing, sem "vamos potencializar resultados"
- **Comparar com insights anteriores** — se você já disse "matar criativo X" e a recomendação não foi executada, reforce; se foi e funcionou, evolua

KNOWLEDGE BASE A SEGUIR — Impacta, produto, plano da campanha, best practices de tráfego. Use isso pra calibrar todas as recomendações.

---

`;

const SYSTEM_PROMPT_TAIL = `\n\n---\n\nFORMATO DE OUTPUT: JSON estruturado conforme schema definido. Campos:

- **headline** (string, 1 linha, até 100 chars): mensagem principal do dia. Direta e quantitativa.
  Ex: "CTR Meta caiu 40% em 24h — fadiga criativa no Reel 'Pare de perguntar'"

- **severity** (enum INFO|WARN|HIGH|CRITICAL):
  - INFO: tudo dentro do esperado
  - WARN: anomalia detectada, exige atenção
  - HIGH: KPI fora do target, exige ação nas próximas 24h
  - CRITICAL: risco da meta de campanha, exige intervenção imediata

- **summary** (markdown, 3–6 linhas): análise narrativa que explica o porquê dos números. Cita os 2–3 dados mais importantes do dia e como se comparam com média 7d / ontem / target.

- **recommendations** (array 3–5 itens), cada um:
  - **priority** (int 1–5, 1 = mais urgente)
  - **action** (string): ação específica e executável. Não "melhorar o anúncio" — "Pausar M1-VIDEO-PARE-PERGUNTAR no conjunto A (CTR 0,4% vs 1,5% alvo) e ativar variação M1-VIDEO-20PROJETOS"
  - **expected_impact** (string): efeito esperado quantificado. "CPL deve cair pra ~R$ 50 (vs R$ 87 atual) e gerar +6 leads/dia"

Lembre: o tempo do leitor é limitado. Headline + summary devem dar a foto em 30 segundos.`;

type InsightOutput = {
  headline: string;
  severity: "INFO" | "WARN" | "HIGH" | "CRITICAL";
  summary: string;
  recommendations: Array<{ priority: number; action: string; expected_impact: string }>;
};

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    severity: { type: "string", enum: ["INFO", "WARN", "HIGH", "CRITICAL"] },
    summary: { type: "string" },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          priority: { type: "integer" },
          action: { type: "string" },
          expected_impact: { type: "string" },
        },
        required: ["priority", "action", "expected_impact"],
        additionalProperties: false,
      },
    },
  },
  required: ["headline", "severity", "summary", "recommendations"],
  additionalProperties: false,
} as const;

function formatUserPrompt(s: DailySnapshot): string {
  const fmtBRL = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
  const fmtNum = (n: number) => new Intl.NumberFormat("pt-BR").format(n);
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;

  const c = s.captacao;
  const m = s.midia;
  const v = s.vendas;
  const cmp = s.comparacao;

  const topFontes = c.visitasPorFonte
    .map(
      (f, i) =>
        `${i + 1}. ${f.utmSource ?? "direto"} / ${f.utmMedium ?? "—"} · campanha=${
          f.utmCampaign ?? "—"
        } · anuncio=${f.utmContent ?? "—"} → ${fmtNum(f.visitas)} visitas, ${fmtNum(
          f.clickCompra
        )} compras (conv ${fmtPct(f.conv)})`
    )
    .join("\n");

  const insightsPrev =
    s.insightsAnteriores.length === 0
      ? "Nenhum insight anterior (primeiro dia da campanha ou primeiro run do agente)."
      : s.insightsAnteriores
          .map(
            (i) =>
              `[${i.date}] severity=${i.severity}\n  Headline: ${i.headline}\n  Top recs: ${i.keyRecommendations.join(" | ")}`
          )
          .join("\n\n");

  return `# ANÁLISE DO DIA ${s.analysisDate}

Produto: ${s.productSlug}  |  Campanha: ${s.campaignSlug ?? "(produto-wide)"}
${s.campaignDay !== null ? `Dia ${s.campaignDay} da campanha` : ""}${
    s.daysToFinalEnrollment !== null ? ` · ${s.daysToFinalEnrollment} dias até fim das matrículas` : ""
  }

## CAPTAÇÃO

- Visitas LP: **${fmtNum(c.visitas)}** (ontem ${fmtNum(cmp.visitasOntem)}, média 7d ${fmtNum(
    Math.round(cmp.visitasMedia7d)
  )})
- Click_compra: **${fmtNum(c.clickCompra)}** (ontem ${fmtNum(cmp.clickCompraOntem)}, média 7d ${cmp.clickCompraMedia7d.toFixed(1)})
- Click_consultor: ${fmtNum(c.clickConsultor)}
- Click_whats: ${fmtNum(c.clickWhats)}
- Lead form: ${fmtNum(c.leadForm)}
- Conv visita→compra: **${fmtPct(c.convVisitaParaCompra)}**

### Top 10 fontes por visitas

${topFontes || "(sem visitas registradas)"}

## MÍDIA

- Spend dia: **${fmtBRL(m.spendDia)}** (${fmtBRL(m.spendDiaMeta)} Meta + ${fmtBRL(m.spendDiaGoogle)} Google)
- Spend ontem: ${fmtBRL(cmp.spendOntem)}  |  Média 7d: ${fmtBRL(cmp.spendMedia7d)}  |  Variação vs 7d: ${fmtPct(m.spendVs7dMedia)}
- Spend acumulado mês: **${fmtBRL(m.spendAcumuladoMes)}** (target campanha total R$ 9.000)
- Impressões: ${fmtNum(m.impressionsDia)}
- Cliques Ads: ${fmtNum(m.clicksAdsDia)}
- CTR ads: ${fmtPct(m.ctrAdsDia)}
- CPC médio: ${fmtBRL(m.cpcMedioAds)}

## VENDAS

- Novas vendas hoje: **${fmtNum(v.novasDia)}**  |  Receita hoje: **${fmtBRL(v.receitaDia)}**
- CAC hoje: ${v.cacDia ? fmtBRL(v.cacDia) : "—"} (target ≤ R$ 300)
- ROAS hoje: ${v.roasDia ? v.roasDia.toFixed(2) + "x" : "—"} (target ≥ 5,0x)
- Acumulado campanha: **${fmtNum(v.acumuladoMatriculas)}** matrículas / 30 alvo (${fmtPct(v.progressoMeta)})
- Receita acumulada: ${fmtBRL(v.acumuladoReceita)}
- Vendas média 7d: ${cmp.vendasMedia7d.toFixed(1)}/dia

## INSIGHTS ANTERIORES (memória — últimos 7 dias)

${insightsPrev}

---

Gere AGORA a análise estratégica do dia ${s.analysisDate} no formato JSON estruturado, considerando:

1. **Cronologia**: estamos no dia ${s.campaignDay ?? "?"} da campanha. Volume baixo nos 2–3 primeiros dias é esperado (algoritmo aprendendo).
2. **Targets**: matrículas 30 · CAC ≤ R$ 300 · ROAS ≥ 5x · CPL R$ 32–36 · 9k budget total.
3. **Memória**: se você recomendou algo nos últimos dias e não foi executado, reforce. Se foi e funcionou, evolua.
4. **Recomendações executáveis hoje** (próximas 24h), não daqui a 2 semanas.
`;
}

export async function generateInsight(opts: {
  snapshot: DailySnapshot;
  campaignSlug?: string | null;
  apiKey?: string;
  dryRun?: boolean;
}): Promise<{
  outcome: "created" | "updated" | "dry_run" | "skipped" | "error";
  insightId?: string;
  output?: InsightOutput;
  reason?: string;
  tokensIn?: number;
  tokensOut?: number;
  cachedTokensRead?: number;
}> {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { outcome: "error", reason: "ANTHROPIC_API_KEY nao configurada" };
  }

  const knowledge = loadKnowledgeBase();
  const userPrompt = formatUserPrompt(opts.snapshot);

  if (opts.dryRun) {
    return {
      outcome: "dry_run",
      reason: `prompt size: system=${(SYSTEM_PROMPT_HEAD + knowledge + SYSTEM_PROMPT_TAIL).length} chars, user=${userPrompt.length} chars`,
    };
  }

  const client = new Anthropic({ apiKey });

  let resp;
  try {
    resp = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      // System como array — breakpoint cache no fim do knowledge base.
      // 1h TTL pra cobrir backfills sequenciais (5min nao chega na proxima call diaria).
      system: [
        { type: "text", text: SYSTEM_PROMPT_HEAD },
        {
          type: "text",
          text: knowledge,
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
        { type: "text", text: SYSTEM_PROMPT_TAIL },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: OUTPUT_SCHEMA,
        },
      },
      messages: [{ role: "user", content: userPrompt }],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { outcome: "error", reason: `anthropic_api_error: ${msg}` };
  }

  // Extrai o JSON do primeiro text block
  const textBlock = resp.content.find((b) => b.type === "text") as
    | { type: "text"; text: string }
    | undefined;
  if (!textBlock) {
    return { outcome: "error", reason: "no_text_block_in_response" };
  }

  let output: InsightOutput;
  try {
    output = JSON.parse(textBlock.text) as InsightOutput;
  } catch (err) {
    return {
      outcome: "error",
      reason: `json_parse_failed: ${err instanceof Error ? err.message : String(err)} / raw=${textBlock.text.slice(0, 200)}`,
    };
  }

  const analysisDateUTC = new Date(opts.snapshot.analysisDate + "T03:00:00.000Z");

  // Upsert pra ser idempotente — re-rodar mesmo dia atualiza, nao duplica.
  try {
    const saved = await prisma.dailyInsight.upsert({
      where: {
        productSlug_campaignSlug_analysisDate: {
          productSlug: opts.snapshot.productSlug,
          campaignSlug: opts.campaignSlug ?? "",
          analysisDate: analysisDateUTC,
        },
      },
      create: {
        productSlug: opts.snapshot.productSlug,
        campaignSlug: opts.campaignSlug ?? "",
        analysisDate: analysisDateUTC,
        headline: output.headline,
        summary: output.summary,
        recommendations: output.recommendations,
        severity: output.severity,
        metricsSnapshot: JSON.parse(JSON.stringify(opts.snapshot)),
        model: MODEL,
        tokensIn: resp.usage.input_tokens,
        tokensOut: resp.usage.output_tokens,
        cachedTokensRead: resp.usage.cache_read_input_tokens ?? 0,
        promptVersion: PROMPT_VERSION,
      },
      update: {
        headline: output.headline,
        summary: output.summary,
        recommendations: output.recommendations,
        severity: output.severity,
        metricsSnapshot: JSON.parse(JSON.stringify(opts.snapshot)),
        model: MODEL,
        tokensIn: resp.usage.input_tokens,
        tokensOut: resp.usage.output_tokens,
        cachedTokensRead: resp.usage.cache_read_input_tokens ?? 0,
        promptVersion: PROMPT_VERSION,
        generatedAt: new Date(),
      },
    });

    return {
      outcome: saved.generatedAt.getTime() === saved.generatedAt.getTime() ? "created" : "updated",
      insightId: saved.id,
      output,
      tokensIn: resp.usage.input_tokens,
      tokensOut: resp.usage.output_tokens,
      cachedTokensRead: resp.usage.cache_read_input_tokens ?? 0,
    };
  } catch (err) {
    return {
      outcome: "error",
      reason: `db_save_failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
