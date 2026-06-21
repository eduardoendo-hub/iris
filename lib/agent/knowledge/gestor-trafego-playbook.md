# Playbook do Gestor de Tráfego IA (cross-campanha)

> Base de conhecimento do agente que olha TODAS as campanhas ativas (Meta + Google)
> e recomenda ações priorizadas. Fundamentado em best practices de mercado 2026.
> O agente é um **engenheiro de receita**: não só "media buyer", entende como o
> negócio ganha dinheiro e prioriza por impacto no resultado.

## 1. Benchmarks de referência (2026) — usar como SINAL, não regra cega
> Valores de mercado (origem USD; tratar como ordem de grandeza). O alvo REAL é
> o histórico da própria conta + a meta da campanha (CPL/ROAS definidos).

| Métrica | Cross-industry (Search) | **B2B / SaaS** | Leitura |
|---|---|---|---|
| **CPC** | US$ 2,96–4,22 | **US$ 5,3** (SaaS, +29% a/a) | B2B é mais caro |
| **CTR (Search)** | 3,5–6,1% | **0,8–2,9%** | B2B costuma ser < média |
| **Conversão (clique→lead)** | 4,4% | **1,4%** (tech pode > 4%) | ciclo B2B é longo |
| **CPL** | — | SMB US$ 87–200 · mid-market US$ 200–900 · enterprise US$ 1.500–4.500 | varia por ticket |

- **Quality Score:** CTR baixo derruba o QS → **empurra o CPC pra cima**. CTR é alavanca de custo, não só de volume.
- ⚠️ Médias de indústria FALHAM como meta — **comparar campanha contra o histórico dela e contra as outras campanhas da carteira**.

## 2. Regras de DECISÃO (o que o agente recomenda)
Cada recomendação = `{prioridade, campanha, problema (com número), ação, impacto esperado}`.

### 🔴 PAUSAR / CORTAR
- Keyword/anúncio/campanha que **consistentemente não bate** o alvo (CPL/CPA/ROAS) → pausar e **realocar o budget** pra quem performa.
- Ex.: "campanha gastou R$ X/dia com retorno mínimo → pausar e redirecionar".
- Sempre comparar contra **meta definida** + **mediana da carteira**.

### 🟢 ESCALAR (quando bater meta consistente)
- Campanha batendo **CPA/ROAS** de forma estável → escalar:
  - **+10–20% de budget por vez** (nunca dobrar de uma vez — desestabiliza o Smart Bidding / reseta learning).
  - Expandir keywords com **variações de alta intenção**.
  - Testar **novos públicos / geos** que performam.
- **Escala horizontal** (preferida): duplicar a campanha vencedora e mudar **1 variável** (público, criativo, posicionamento) — isola o que funciona.

### 🟡 REALOCAR / AJUSTAR
- **Budget pacing:** alvo **95–105%** do budget diário = estável. Oscilar 60–140% → erro de previsão de conversão compõe → volatilidade de CPA.
  - Regra: se o **coef. de variação do gasto diário > 30% por 7+ dias** → esperar volatilidade de CPA em 10–14 dias → agir antes.
- **Lance baixo** perdendo impressão (taxa de impressão perdida por lance alta) → subir CPC/ajustar estratégia.

### ⚪ ALERTAR (sem ação automática)
- Anomalias: gasto disparou, conversão zerou, CTR despencou, learning resetado.

## 3. Google Ads — específico
- **Correspondência exata** pra keywords de **alta intenção / alto valor** (controle de mensagem). Expansão automática roda **junto**, não no lugar.
- **Relatório de termos de pesquisa = SEMANAL.** Achou termo bom convertendo → **gradue pra um ad group de exata** (controle). Achou lixo → **negativa imediata**.
- **Lista de negativas compartilhada** (account-level) p/ termos universalmente ruins: `free, grátis, cheap, barato, DIY, "how to", "como fazer", jobs, vagas, careers, currículo` + marca de concorrente (se não roda conquista). Negativa bem mantida **corta 20–40% de desperdício** sem mexer em lance/criativo.
- **Estrutura:** agrupar keyword por **tema** (só similares juntas) → anúncio relevante → CTR/QS melhores. Alta intenção primeiro.
- **Análise de keyword (o que o agente olha):**
  - **Performando** (escalar/graduar): bom volume + CPL/CVR dentro da meta + QS ≥ 7.
  - **Desperdiçando** (negativar/pausar): gasto sem conversão, CTR muito baixo, QS baixo, termos de busca irrelevantes.
  - **Baixo volume:** normal em nicho novo — não custa, reativa sozinha.

## 4. Meta Ads — específico
- **Fase de aprendizado:** ~**50 conversões/conjunto/semana** pra sair. Abaixo disso o conjunto não estabiliza.
- **NÃO editar > 20%** de budget, nem trocar público/evento/criativo/lance → **reseta o aprendizado** (joga fora o sinal). Subir **10–20% a cada 2–3 dias**.
- **CBO vs ABO:**
  - **ABO** (budget no conjunto) → **testar** conceitos/públicos/geos distintos (cada um lê seu próprio aprendizado).
  - **CBO / Advantage+** → **escalar** o que já provou, com volume de conversão suficiente.
  - Pro: testa em ABO → duplica vencedores no CBO (por post ID), mantém os ABO vivos.
- **Criativo:** vídeo curto **15–30s** = maior densidade de sinal (3s views, ThruPlay alimentam o algoritmo rápido).
- **Escala horizontal:** duplicar campeã, mudar 1 variável.

## 5. Tarefas DIÁRIAS do agente (rotina de gestor)
1. **Pacing de budget** — quem está sub/sobre-gastando.
2. **Termos de pesquisa** (Google) — novos negativos + termos a graduar.
3. **Quality Score / CTR** — quedas que encarecem.
4. **Pausar** keyword/anúncio/campanha que não bate meta.
5. **Escalar** quem bate meta (10–20%).
6. **Anomalias** — picos/quedas.
7. **Realocação** — mover budget do pior pro melhor da carteira.

## 6. Como PRIORIZAR as dicas
Ordenar por **impacto no resultado × facilidade**:
1. 🔴 **Sangria de budget** (corte imediato — economia certa).
2. 🟢 **Escalar vencedor** (mais resultado pelo mesmo CAC).
3. 🟡 **Ajuste de lance/pacing** (estabiliza CPA).
4. ⚪ **Testes** (criativo/público novo).
> Entregar **as 3–5 ações que mais importam hoje**, não 20 vagas. Cada uma com o **número** que a justifica.

---
## Fontes (pesquisa de mercado, jun/2026)
- [Google Ads Best Practices & Scaling 2026 — Impactable](https://impactable.com/google-ads-best-practices/)
- [15 Google Ads Best Practices B2B 2026 — Directive](https://directiveconsulting.com/blog/the-b2b-marketers-guide-to-google-ads-best-practices-2026/)
- [Meta Ads Scaling Strategy 2026 — CausalFunnel](https://www.causalfunnel.com/blog/how-to-scale-facebook-ads-effective-meta-ads-scaling-strategy-for-2026/)
- [Exit Meta Learning Phase 2026 — Modern Marketing Institute](https://www.modernmarketinginstitute.com/blog/how-to-exit-the-meta-ads-learning-phase-fast-and-start-scaling-profitably-in-2026)
- [ABO vs CBO 2026 — Superscale](https://superscale.ai/learn/cbo-vs-abo-advantage-plus/)
- [PPC Benchmarks 2026 — WebFX](https://www.webfx.com/blog/marketing/ppc-benchmarks-to-know/)
- [B2B SaaS Google Ads Benchmarks 2026 — Kampaio](https://www.kampaio.com/blog/b2b-saas-google-ads-benchmarks-2026)
- [PPC Budget Pacing 2026 — Improvado](https://improvado.io/blog/budget-pacing)
- [New PPC Playbook: Profit Engineer — Search Engine Land](https://searchengineland.com/new-ppc-playbook-profit-engineer-474277)
- [Manage PPC Budgets — Optmyzr](https://www.optmyzr.com/blog/manage-ppc-budgets/)
