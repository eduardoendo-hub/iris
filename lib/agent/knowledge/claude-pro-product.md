# Curso: Formação Claude Pro — Do Cowork ao Code

> EVERGREEN: este arquivo descreve o PRODUTO (posicionamento, currículo,
> personas, funil) — coisas que NÃO mudam por turma. Os números da turma
> vigente (preço, datas da turma, janela de matrículas, metas, sharedId do
> checkout) vêm SEMPRE do relatório do dia (campanha ACTIVE no banco) e do
> "PLANO DA CAMPANHA" quando presente. NUNCA assuma preço/data/meta fixos aqui
> — use os do relatório.

## Síntese do produto

- **Slug interno IRIS**: `claude-pro`
- **Nome comercial**: Formação Claude Pro: do Cowork ao Code
- **Formato**: 100% ao vivo online sincrônico, 5 dias consecutivos, 19h–22h (Brasília)
- **Total de horas**: 15h ao vivo + ~5h de bônus para os primeiros inscritos
- **Entregáveis**: **20 projetos reais** construídos durante o curso, todos aplicáveis ao trabalho do aluno
- **Pré-requisito explícito**: o aluno precisa ter (ou adquirir) **assinatura Claude Pro** (~US$ 20/mês). Não é objeção forte — público-alvo já tem ou aceita pagar.
- **Sem pré-requisito técnico**: não precisa saber programar (decisivo na conversão)

## Ticket e oferta

- O **preço da turma vigente** e o parcelamento são definidos na LP/checkout
  Engaged — NÃO assuma um valor fixo. Para raciocinar sobre ticket médio, use o
  ticket real implícito nos dados: `acumuladoReceita / acumuladoMatriculas`.
- Bônus típico: 1h extra ao vivo com instrutor para os primeiros inscritos.
- Forma de pagamento: à vista ou parcelado no checkout Engaged.

## Datas e metas

- A **janela de matrículas**, as **datas da turma** e as **metas** (matrículas,
  receita, CAC, ROAS, CPL, budget) são as do **relatório do dia** — resolvidas da
  campanha ACTIVE no banco. Cada turma tem as suas. Use SEMPRE o que vier no
  relatório, não números deste arquivo.

## Promessa central / hook

"Pare de perguntar para a IA. Comece a construir sistemas com ela."

O insight é: a maioria das pessoas usa Claude/ChatGPT só como chat avançado (pergunta e resposta). O curso ensina a **operar a IA como ferramenta de trabalho**: Skills, RAG sobre arquivos próprios, agentes autônomos, integração com Excel/SQL/APIs, automação de fluxos.

## Currículo (dia a dia)

- **Dia 1 — Cowork**: configuração, prompts avançados, Projects do Claude, Skills básicas.
- **Dia 2 — Dados**: análise de planilha real do aluno (Excel/CSV), gráficos, relatórios.
- **Dia 3 — Documentos**: RAG sobre documentos próprios (PDFs, atas, contratos).
- **Dia 4 — Agentes**: Skills customizadas, agentes autônomos, integração API.
- **Dia 5 — Code**: do chat ao terminal — Claude Code, automação real, deploy.

## Personas do funil

1. **Gestor com dor operacional** (mais comum): "perco 3h/dia em planilhas, relatórios, organização — quero automatizar."
2. **Especialista quer subir de nível**: analista, consultor, pesquisador — quer agentes que ampliem seu output.
3. **Empreendedor / fundador**: quer construir produto/processo com IA sem contratar dev.
4. **Profissional de marketing / vendas**: quer automação de funil, análise de dados, criação de conteúdo.

## Objeções comuns na LP

- **"Preciso saber programar?"** → Não. Reforçar isso no criativo e na LP.
- **"Está caro"** → Comparar com 1h de consultoria (R$ 500+) ou ROI do primeiro projeto. (Use o preço atual da oferta, não um valor fixo.)
- **"Só 5 dias dá tempo?"** → 20 projetos provam densidade. Reforçar.
- **"Já uso ChatGPT/Claude"** → Esse é o gatilho central — você usa como chat, vai aprender a usar como sistema.

## Pipeline de monetização

```
LP → click_compra → checkout Engaged (da turma vigente; o sharedId mora na
   Campaign.engagedCheckoutSharedIds) → pagamento → webhook
   → /api/webhook/engaged → Sale criada no IRIS
```

Outros caminhos:
- **WhatsApp**: float bubble + sticky bar → conversão por SDR (vira `source=CONSULTOR` na Sale).
- **Form "Falar com especialista"**: lead vai pro RD CRM, SDR liga, vira matrícula `source=CONSULTOR`.
- **Direta**: matrícula tirada por canal não rastreável (raro, lançada manual via cockpit).

## ⚠️ DEFINIÇÕES CRÍTICAS — não confunda

Existe uma diferença ENORME entre eventos de **intenção** e **matrícula real**. NUNCA conte intenção como venda.

| Métrica | O que é | Origem técnica | Significado |
|---|---|---|---|
| **`captacao.visitas`** | quantos page views da LP | VisitEvent (`lp_view`) | sessão na LP, NÃO comprou |
| **`captacao.clickCompra`** | quantos cliques no botão "Garantir vaga" | VisitEvent (`click_compra`) | **INTENÇÃO de compra**, NÃO matrícula. O usuário foi pro checkout, pode ter desistido lá. Tipicamente 5–20% dos clicks viram compra de fato. |
| **`captacao.clickConsultor`** | cliques em "Falar com especialista" | VisitEvent (`click_consultor`) | INTENÇÃO de falar com SDR, NÃO matrícula |
| **`captacao.clickWhats`** | cliques pra abrir WhatsApp | VisitEvent (`click_whats`) | INTENÇÃO de conversar, NÃO matrícula |
| **`captacao.leadForm`** | submits do form "Falar com especialista" | VisitEvent (`lead_form`) | Lead capturado (vira deal no RD CRM), NÃO matrícula |
| **`vendas.novasDia`** | **MATRÍCULAS pagas** confirmadas no dia | Sale (de webhook Engaged confirmado OU manual via cockpit) | **A ÚNICA MÉTRICA QUE CONTA COMO VENDA REAL** |
| **`vendas.acumuladoMatriculas`** | total de matrículas pagas da campanha vigente | Sale (escopado à janela da campanha) | **Único número que conta pra meta de matrículas** |
| **`vendas.receitaDia` / `acumuladoReceita`** | R$ efetivo de matrículas | Sale (sum amount) | dinheiro recebido |

**Regras de raciocínio:**
- "Conversão" no funil pode significar coisas diferentes — sempre especifique qual:
  - **Conv visita→intent**: `clickCompra / visitas` (mede se a LP gera interesse)
  - **Conv visita→matrícula**: `novasDia / visitas` (mede taxa final de compra)
  - **Conv intent→matrícula**: `novasDia / clickCompra` (mede se o checkout retém)
- Para **CAC e ROAS**: usa SEMPRE `vendas.novasDia` e `vendas.receitaDia`, NUNCA `clickCompra`.
- Para **progresso da meta**: usa `vendas.acumuladoMatriculas` / meta de matrículas do relatório.
- Quando vê 18 clickCompra e 2 novasDia: NÃO diga "18 matrículas". Diga "18 intent-clicks geraram 2 matrículas no dia (conv intent→matrícula 11%)".
- Se click_compra alto e novasDia baixo, o problema está no **checkout** (Engaged) ou na LP convertendo curiosos demais — não no tráfego.
