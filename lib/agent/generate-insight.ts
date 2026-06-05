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

const PROMPT_VERSION = "v2";
const MODEL = "claude-opus-4-7";

// Cache da knowledge base POR PRODUTO — cada produto pode ter seus proprios
// markdowns; o generico (impacta-context, traffic-best-practices) entra sempre.
const cachedKnowledgeByProduct = new Map<string, string>();
function loadKnowledgeBase(productSlug: string): string {
  const cached = cachedKnowledgeByProduct.get(productSlug);
  if (cached) return cached;
  const dir = path.join(process.cwd(), "lib", "agent", "knowledge");
  const altDir = path.join("/app", "lib", "agent", "knowledge");
  const baseDir = fs.existsSync(dir) ? dir : altDir;
  // Genericos sempre + especificos do produto SE existirem. Assim cada produto
  // (claude-pro, codigozero, advia, ...) usa seu proprio contexto, e produto
  // novo sem markdown ainda cai no generico em vez de receber contexto alheio.
  const candidates = [
    "impacta-context.md",
    "traffic-best-practices.md",
    `${productSlug}-product.md`,
    `${productSlug}-campaign-plan.md`,
    // Back-compat: os arquivos originais do claude-pro nao tinham prefixo no
    // campaign-plan. Mantem pra nao perder contexto da turma de claude-pro.
    ...(productSlug === "claude-pro" ? ["campaign-plan.md"] : []),
  ];
  const parts: string[] = [];
  for (const f of candidates) {
    const p = path.join(baseDir, f);
    if (fs.existsSync(p)) parts.push(`# === ${f} ===\n\n${fs.readFileSync(p, "utf8")}`);
  }
  const kb = parts.join("\n\n---\n\n");
  cachedKnowledgeByProduct.set(productSlug, kb);
  return kb;
}

const SYSTEM_PROMPT_HEAD = `Voce e um gestor de trafego senior especializado em Meta Ads e Google Ads, com 10+ anos em campanhas de educacao executiva no Brasil. Voce foi contratado pela Impacta Treinamentos pra analisar diariamente a performance da campanha de lancamento informada no relatorio do dia e dar direcao estrategica concreta — nao relatorios genericos. O produto, a campanha e as METAS (matriculas, CAC, ROAS, CPL, budget) variam por lancamento e vem SEMPRE no relatorio do dia (secao de cabecalho e VENDAS). Use os alvos do relatorio, nunca numeros decorados.

Seu trabalho TODO DIA:
1. Receber dados do dia anterior (captacao, midia, vendas) + historico de 7 dias + insights anteriores
2. Identificar o que esta funcionando, o que esta quebrado, o que e ruido
3. Recomendar 1 a 3 acoes especificas, priorizadas e quantificadas que o time deve executar nas proximas 24h. Menos e melhor — so recomende o que realmente importa hoje.
4. Comparar com os targets do plano de marketing que vierem no relatorio (CAC, ROAS, meta de matriculas, CPL, budget total) — sao especificos da campanha do dia.

PRINCIPIOS:
- Decisao por evidencia — nao recomende escalar criativo com <200 cliques nem matar com <1.000 impressoes
- Uma variavel por vez — nao acumule "troca criativo + mexe publico + ajusta copy"
- Quantifique impacto esperado ("reduzir CPL pra R$ 50 = matriculas 12 para 18")
- Reconheca incerteza quando volume e baixo
- Tom direto e tecnico — sem cliches de marketing, sem "vamos potencializar resultados"
- Comparar com insights anteriores — se voce ja disse "matar criativo X" e a recomendacao nao foi executada, reforce; se foi e funcionou, evolua

ATENCAO ESPECIAL — NAO CONFUNDA INTENT COM VENDA:
- click_compra = clique no botao de compra na LP (INTENT, vai pro checkout). NAO e matricula.
- click_consultor = clique pra falar com SDR (INTENT). NAO e matricula.
- click_whats = clique pro WhatsApp (INTENT). NAO e matricula.
- lead_form = submit do form Falar com Especialista. E lead, NAO e matricula.
- "novasDia" e "acumuladoMatriculas" — ESSAS sao as matriculas reais (Sale, pagamento confirmado).
- Para CAC, ROAS e progresso da meta de 30 matriculas, use SEMPRE vendas.novasDia / vendas.acumuladoMatriculas, NUNCA clickCompra.

FORMATO DE TEXTO (CRITICO):
- NAO use marcacao markdown no campo summary. Sem **bold**, sem *italico*, sem # headers, sem listas com - ou *.
- Texto corrido, paragrafos separados por linha em branco se precisar.
- Pode usar numeros e R$ a vontade. Nao use simbolos de formatacao.
- O motivo: o card no cockpit renderiza texto puro; markdown aparece literal ("**Meta zerado**" em vez de negrito).

KNOWLEDGE BASE A SEGUIR — Impacta, produto, plano da campanha, best practices de trafego. Use isso pra calibrar todas as recomendacoes.

---

`;

const SYSTEM_PROMPT_TAIL = `\n\n---\n\nFORMATO DE OUTPUT: JSON estruturado conforme schema definido. Campos:

- headline (string, 1 linha, ate 120 chars): mensagem principal do dia. Direta e quantitativa. TEXTO PURO, sem markdown.
  Ex: "CTR Meta caiu 40% em 24h, fadiga criativa no Reel Pare de perguntar"

- severity (enum INFO ou WARN ou HIGH ou CRITICAL):
  - INFO: tudo dentro do esperado
  - WARN: anomalia detectada, exige atencao
  - HIGH: KPI fora do target, exige acao nas proximas 24h
  - CRITICAL: risco da meta de campanha, exige intervencao imediata

- summary (string, 3 a 6 linhas, TEXTO PURO sem markdown): analise narrativa que explica o porque dos numeros. Cita os 2 a 3 dados mais importantes do dia e como se comparam com media 7d, ontem ou target. Nao use **, *, #, listas, ou qualquer marcacao.

- recommendations (array, 1 a 3 itens — qualidade > quantidade):
  - priority (int 1 a 5, 1 = mais urgente)
  - action (string, MINIMO 20 chars, TEXTO PURO): acao especifica e executavel. Nao "melhorar o anuncio" mas "Pausar M1-VIDEO-PARE-PERGUNTAR no conjunto A (CTR 0,4% vs 1,5% alvo) e ativar variacao M1-VIDEO-20PROJETOS"
  - expected_impact (string, MINIMO 15 chars, TEXTO PURO): efeito esperado quantificado. "CPL deve cair pra R$ 50 (vs R$ 87 atual) e gerar +6 leads/dia"

REGRA DAS RECOMENDACOES — QUALIDADE > QUANTIDADE:
- Gere de 1 a 3 acoes. Pode ser 1 se hoje tem apenas 1 movimento realmente importante. Pode ser 3 se ha multiplos sinais distintos exigindo acao.
- NUNCA gere acao "pra encher" — recomendacao padding (ex: "monitorar metricas" sem direcao) e pior que nao ter recomendacao.
- Se o dia esta calmo e nao ha movimento que valha a pena, gere apenas 1 acao do tipo "manter setup atual + observar X por mais 24h antes de mexer".
- Cada acao precisa: passar no teste do "alguem consegue executar isso em <60min". Se nao passa, refaz.
- NUNCA retorne array vazio (minimo 1 acao sempre — mesmo que seja "observar e nao agir").

Lembre: o tempo do leitor e limitado. Headline + summary devem dar a foto em 30 segundos. TEXTO PURO em todos os campos.`;

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
      // Anthropic structured outputs tem JSON schema muito restrito:
      //   - minItems > 1: rejeitado ("only 0 or 1 are supported")
      //   - minimum/maximum em integer: rejeitado
      //   - minLength em string: provavelmente rejeitado tambem
      // So usamos type + properties + required + additionalProperties.
      // Regras de quantidade/tamanho ficam no prompt + sanity check
      // em runtime (linha ~302 que rejeita empty array).
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
  const g = s.goals;
  // Alvos da campanha do dia — formatados, com "—" quando nao cadastrados.
  const tgtCac = g.cacMax > 0 ? `target ≤ ${fmtBRL(g.cacMax)}` : "sem target cadastrado";
  const tgtRoas = g.roasAlvo > 0 ? `target ≥ ${g.roasAlvo.toFixed(1)}x` : "sem target cadastrado";
  const tgtMatriculas = g.matriculas > 0 ? `${fmtNum(g.matriculas)} alvo` : "sem meta cadastrada";
  const tgtBudget = g.budgetTotal > 0 ? `target campanha total ${fmtBRL(g.budgetTotal)}` : "sem budget cadastrado";
  const targetsLine = [
    g.matriculas > 0 ? `matrículas ${fmtNum(g.matriculas)}` : null,
    g.cacMax > 0 ? `CAC ≤ ${fmtBRL(g.cacMax)}` : null,
    g.roasAlvo > 0 ? `ROAS ≥ ${g.roasAlvo.toFixed(1)}x` : null,
    g.cplAlvo > 0 ? `CPL ${fmtBRL(g.cplAlvo)}` : null,
    g.budgetTotal > 0 ? `${fmtBRL(g.budgetTotal)} budget total` : null,
  ]
    .filter(Boolean)
    .join(" · ") || "(metas nao cadastradas na campanha)";
  // Plano de marketing cadastrado NESTA campanha — quando presente, e a fonte
  // autoritativa da realidade da turma vigente (sobrepoe o manual evergreen).
  const planoBlock = s.campaignPlan
    ? `\n## PLANO DA CAMPANHA VIGENTE (cadastrado nesta turma — use como fonte da realidade)\n\n${s.campaignPlan}\n`
    : "";

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

Produto: ${s.productSlug}  |  Campanha: ${s.campaignName || s.campaignSlug || "(produto-wide)"}${s.campaignSlug ? ` (${s.campaignSlug})` : ""}
${s.campaignDay !== null ? `Dia ${s.campaignDay} da campanha` : ""}${
    s.daysToFinalEnrollment !== null ? ` · ${s.daysToFinalEnrollment} dias até fim das matrículas` : ""
  }
${planoBlock}
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
- Spend acumulado mês: **${fmtBRL(m.spendAcumuladoMes)}** (${tgtBudget})
- Impressões: ${fmtNum(m.impressionsDia)}
- Cliques Ads: ${fmtNum(m.clicksAdsDia)}
- CTR ads: ${fmtPct(m.ctrAdsDia)}
- CPC médio: ${fmtBRL(m.cpcMedioAds)}

## VENDAS

- Novas vendas hoje: **${fmtNum(v.novasDia)}**  |  Receita hoje: **${fmtBRL(v.receitaDia)}**
- CAC hoje: ${v.cacDia ? fmtBRL(v.cacDia) : "—"} (${tgtCac})
- ROAS hoje: ${v.roasDia ? v.roasDia.toFixed(2) + "x" : "—"} (${tgtRoas})
- Acumulado campanha: **${fmtNum(v.acumuladoMatriculas)}** matrículas / ${tgtMatriculas} (${fmtPct(v.progressoMeta)})
- Receita acumulada: ${fmtBRL(v.acumuladoReceita)}
- Vendas média 7d: ${cmp.vendasMedia7d.toFixed(1)}/dia

## INSIGHTS ANTERIORES (memória — últimos 7 dias)

${insightsPrev}

---

Gere AGORA a análise estratégica do dia ${s.analysisDate} no formato JSON estruturado, considerando:

1. **Cronologia**: estamos no dia ${s.campaignDay ?? "?"} da campanha. Volume baixo nos 2–3 primeiros dias é esperado (algoritmo aprendendo).
2. **Targets** (desta campanha): ${targetsLine}.
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

  const knowledge = loadKnowledgeBase(opts.snapshot.productSlug);
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

  // Sanity check — schema obriga >=3 recommendations mas defendemos contra
  // edge case onde o modelo escapa do schema (raro, mas acontece em retry).
  if (!Array.isArray(output.recommendations) || output.recommendations.length < 1) {
    return {
      outcome: "error",
      reason: `empty_recommendations: modelo retornou ${
        Array.isArray(output.recommendations) ? output.recommendations.length : "nao-array"
      } recomendacoes. Headline gerada: "${output.headline?.slice(0, 80) ?? "—"}". Re-rode cron pra forcar regeneracao.`,
    };
  }

  const analysisDateUTC = new Date(opts.snapshot.analysisDate + "T03:00:00.000Z");

  // Verifica se ja existe pra distinguir created vs updated.
  let preExisting: { id: string } | null = null;
  try {
    preExisting = await prisma.dailyInsight.findUnique({
      where: {
        productSlug_campaignSlug_analysisDate: {
          productSlug: opts.snapshot.productSlug,
          campaignSlug: opts.campaignSlug ?? "",
          analysisDate: analysisDateUTC,
        },
      },
      select: { id: true },
    });
  } catch {
    /* findUnique nao quebra o fluxo */
  }

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
      outcome: preExisting ? "updated" : "created",
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
