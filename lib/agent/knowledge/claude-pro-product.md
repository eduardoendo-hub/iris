# Curso: Formação Claude Pro — Do Cowork ao Code

## Síntese do produto

- **Slug interno IRIS**: `claude-pro`
- **Nome comercial**: Formação Claude Pro: do Cowork ao Code
- **Formato**: 100% ao vivo online sincrônico, 5 dias consecutivos, 19h–22h (Brasília)
- **Total de horas**: 15h ao vivo + ~5h de bônus para os 20 primeiros = 20h
- **Entregáveis**: **20 projetos reais** construídos durante o curso, todos aplicáveis ao trabalho do aluno
- **Pré-requisito explícito**: o aluno precisa ter (ou adquirir) **assinatura Claude Pro** (~US$ 20/mês). Não é tema de objeção forte porque público-alvo já tem ou aceita pagar.
- **Sem pré-requisito técnico**: não precisa saber programar (decisivo na conversão)
- **Política de reembolso**: 7 dias após início (ainda em definição, em flux)

## Ticket e oferta

- **Preço cheio**: R$ 1.800
- **Preço com desconto (atual)**: R$ 1.499
- **Bônus 20 primeiros**: 1h extra ao vivo com instrutor
- **Forma de pagamento**: à vista ou parcelado no checkout Engaged

## Datas da campanha

- **Início mídia paga**: 2026-05-11 (segunda)
- **Início da turma**: 2026-06-08 (segunda)
- **Fim da turma**: 2026-06-12 (sexta) — 5 dias úteis seg-sex
- **Fim de matrículas**: 2026-06-07 (domingo, 23h59)

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
- **"R$ 1.499 é caro"** → Comparar com 1h de consultoria (R$ 500+) ou ROI do primeiro projeto.
- **"Só 5 dias dá tempo?"** → 20 projetos provam densidade. Reforçar.
- **"Já uso ChatGPT/Claude"** → Esse é o gatilho central — você usa como chat, vai aprender a usar como sistema.

## CTAs da LP

- **Hero**: "Quero me matricular · ~~R$ 1.800~~ R$ 1.499"
- **Final**: "Garantir minha vaga · ~~R$ 1.800~~ R$ 1.499"
- **Sticky mobile**: "Quero me matricular" (turma 08/06)
- **Botão WhatsApp**: "Falar com especialista" (envia pra consultor SDR)
- **Form "Falar com especialista"**: cria Lead em RD Station CRM via `integracao-rd`

## Pipeline de monetização

```
LP → click_compra → checkout Engaged (https://impacta.site.engaged.com.br/p/checkout/x68jpj7w3k)
   → pagamento → webhook → /api/webhook/engaged → Sale criada no IRIS
```

Outros caminhos:
- **WhatsApp**: float bubble + sticky bar → conversão por SDR (vira `source=CONSULTOR` na Sale).
- **Form "Falar com especialista"**: lead vai pro RD CRM, SDR liga, vira matrícula `source=CONSULTOR`.
- **Direta**: matrícula tirada por algum canal não rastreável (raro, lançada manual via cockpit).

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
| **`vendas.acumuladoMatriculas`** | total de matrículas pagas da campanha | Sale (todas, agregado) | **Único número que conta pra meta de 30 matrículas** |
| **`vendas.receitaDia` / `acumuladoReceita`** | R$ efetivo de matrículas | Sale (sum amount) | dinheiro recebido |

**Regras de raciocínio:**
- "Conversão" no contexto do funil pode significar coisas diferentes — sempre especifique qual:
  - **Conv visita→intent**: `clickCompra / visitas` (mede se a LP gera interesse)
  - **Conv visita→matrícula**: `novasDia / visitas` (mede taxa final de compra)
  - **Conv intent→matrícula**: `novasDia / clickCompra` (mede se o checkout retém)
- Para **CAC e ROAS**: usa SEMPRE `vendas.novasDia` e `vendas.receitaDia`, NUNCA `clickCompra`.
- Para **progresso da meta**: usa `vendas.acumuladoMatriculas` / 30.
- Quando o agente vê 18 clickCompra e 2 novasDia: NÃO diga "18 matrículas" nem "ROAS de X com 18 vendas". Diga "18 intent-clicks geraram 2 matrículas no dia (conv intent→matrícula 11%)".
- Se houver click_compra alto e novasDia baixo, o problema está no **checkout** (página Engaged) ou na LP convertendo curiosos demais — não no tráfego.
