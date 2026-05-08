# IRIS — Intelligent Revenue & Insight System

Cockpit em tempo real pra monitorar performance de Landing Pages e produtos do TechNow Hub.
Centraliza GA4, Google Ads, Meta Ads, orgânico e Sympla numa tela única.
Camada de IA (Claude) gera insights proativos e dispara alertas — humano decide.

## Status
- 📅 Planejamento: 2026-05-07
- 🚀 Deploy MVP previsto: 2026-05-10 (3 dias)
- 🌐 Domínio: `iris.technowhub.ai`
- 📦 Repo: `eduardoendo-hub/iris` (a ser criado)
- 🏗️ Hosting: Coolify (mesmo servidor que technow-social-engine)

## Documentação
1. [Visão](docs/00-VISION.md) — o quê, por quê, escopo
2. [Arquitetura](docs/01-ARCHITECTURE.md) — stack, fontes de dados, fluxo
3. [Plano de 3 dias](docs/02-PLANO-3-DIAS.md) — execução dia-a-dia
4. [Convenção UTM](docs/03-UTM-CONVENTION.md) — padrão obrigatório pra todas as LPs
5. [Modelo de Dados](docs/04-DATA-MODEL.md) — entidades e schemas
6. [AI Insights](docs/05-AI-INSIGHTS.md) — camada proativa
7. [Design System](docs/06-DESIGN-SYSTEM.md) — visual e componentes

## Produtos no MVP
- **Direito 5.0** — `direito5.technowhub.ai` (live)
- **People AI Lab** — `peopleai.technowhub.ai` (live)
- LPs futuras entram via cadastro no próprio IRIS

## Princípios de produto
1. **Real-time-ish** — dados frescos em ≤ 5 min
2. **Proativo** — IA chama atenção; humano decide
3. **Por produto** — cockpit filtra por LP
4. **Multi-canal** — pago + orgânico + email num só painel
5. **Open by default** — APIs públicas oficiais (GA4 Data API, Google Ads API, Meta Marketing API)
6. **Zero-config pra LPs novas** — basta seguir a [convenção UTM](docs/03-UTM-CONVENTION.md) e cadastrar produto
