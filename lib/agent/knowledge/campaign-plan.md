# Plano de Marketing — Curso Claude Pro (manual de jogo, evergreen)

> EVERGREEN: estratégia, benchmarks e critérios de decisão que valem pra
> QUALQUER turma. As metas, o budget e as datas REAIS da turma vigente vêm do
> relatório do dia (campanha ACTIVE no banco) e do "PLANO DA CAMPANHA" quando
> presente. NUNCA use números absolutos deste arquivo como meta — use os do
> relatório.

## Metas

As metas da turma vigente (matrículas, receita, CAC máximo, ROAS alvo, CPL alvo,
budget de mídia) vêm SEMPRE do relatório do dia. Conversão lead→matrícula
saudável de referência: **11–12%**.

## Janela temporal (fases relativas à campanha)

Mapeie estas fases sobre a janela real `[início, fim de matrículas)` do relatório:

- **Primeiro ~40% da janela** — Descoberta + validação (público frio, hook + autoridade). Volume baixo nos 2–3 primeiros dias é esperado (algoritmo aprendendo).
- **~40%–80% da janela** — Escala dos vencedores + urgência moderada.
- **Últimos ~20% da janela** — Sprint final: urgência forte, "últimas vagas", remarketing agressivo.
- **Após o fim das matrículas** — Turma rodando, sem mídia paga.

## Distribuição de budget (proporções, não valores fixos)

Aplique estes percentuais sobre o budget de mídia REAL da campanha:

| Canal | % | Objetivo |
|---|---:|---|
| Meta prospecting (M1) | 40% | Frio: Reels/carrossel "Pare de perguntar para a IA" |
| Meta remarketing (M2) | 14% | Visitantes da LP + engajados: "Garanta sua vaga" |
| Google Search alta intenção (G1) | 26% | "curso claude pro", "como usar claude na empresa", "agentes IA curso" |
| Google Search complementar (G2) | 7% | "curso ia para gestores", "automatizar com IA" |
| Google Display/PMax remarketing (G3) | 3% | Visitas LP que não converteram |
| Reserva pra escala/teste | 10% | Movido pra criativo vencedor ou novo canal |

## KPIs operacionais por canal (benchmarks)

| Canal | CPM esperado | CTR alvo | CPC alvo | CPL alvo | Conversão LP→Compra |
|---|---:|---:|---:|---:|---:|
| Meta prospecting | R$ 25–40 | >1.5% | R$ 1,80–3,00 | R$ 30–45 | 3–5% |
| Meta remarketing | R$ 15–25 | >3% | R$ 0,80–1,50 | R$ 18–28 | 8–15% |
| Google Search | n/a | >8% | R$ 4–8 | R$ 25–40 | 5–10% |
| Google PMax | R$ 8–18 | >0.5% | R$ 1,50–4,00 | R$ 35–60 | 2–4% |

(CPL "alvo" acima é referência de mercado; o CPL alvo OFICIAL da campanha vem do relatório.)

## Convenções de naming

- **`CLAUDEPRO`** é o substring que o IRIS usa pra filtrar campanhas Meta/Google
  (multi-produto na mesma Ad Account) — estável entre turmas.
- Sufixo de turma no nome (ex: mês/ano) varia por lançamento; não dependa dele.
- Exemplos de estrutura: `M1-PROSP-CLAUDEPRO-...` (Meta lote 1), `G1-SEARCH-CLAUDEPRO-...` (Google). utm_content do criativo descreve o ângulo (ex: `...-PARE-PERGUNTAR`, `...-20PROJETOS`).

## Critérios de decisão (gestão de tráfego)

### Pausar criativo
- **CTR < 0,8%** após 1.000 impressões → matar
- **CPL > 2× alvo** após 50 cliques → matar
- **Frequência > 4,0** em prospecting → matar (fadiga)
- **0 visitas pro LP** após R$ 100 gastos → matar (algo errado no link/criativo)

### Escalar criativo
- **CPL < alvo + CTR > 1,5%** após 200 cliques → +50% budget
- **ROAS > alvo** consistente por 3 dias → duplicar budget + criar variações
- **Conv LP→compra > alvo** → escalar o budget desse criativo, não diluir em novos

### Realocar budget
- **Canal A 1,5× ROAS do canal B** por 3 dias → mover 30% do B pro A
- **Search G1 supera Meta M1 em ROAS** → mover 20% Meta → Google
- Nunca mover mais de 30% do budget de um canal por dia (evita whiplash)

## Marcos críticos (relativos ao dia da campanha)

- **Dia 1** — Subir Meta M1 + Google G1. Validar tracking E2E. Métricas só significativas a partir do dia 3.
- **Dia 3** — Primeira leitura: qual criativo pausar, qual escalar.
- **Dia 7** — Segundo lote criativo Meta (variações dos vencedores).
- **Metade da janela** — Reavaliação geral; preparar sprint final.
- **Últimos ~7 dias** — "Lote urgência": criativos de últimos dias.
- **Últimas 72h** — Push final, remarketing agressivo (até o fim das matrículas).

## Pontos de atenção / red flags

- **Taxa de conversão LP→Compra < 1%** após 200 visitas → problema na LP, não no tráfego.
- **CAC subindo dia a dia** → fadiga de público; rotacionar criativo ou expandir audiência.
- **Spend Meta cresce mas leads não** → otimização do algoritmo pra audiência errada; revisar conjunto.
- **Google Search CTR caindo** → competição subiu, revisar lance e copy do anúncio.
- **CPL ok mas matrículas baixas** → problema no funil pós-clique (LP, checkout, ou SDR).
