# IRIS — Intelligent Revenue & Insight System

Cockpit de campanhas do TechNow Hub. Centraliza GA4, Google Ads, Meta Ads,
eventos das Landing Pages e vendas do Engaged numa tela por produto, com uma
camada de IA (Claude) que gera insights diários e recomenda ações de mídia paga.

**Em produção** — `https://iris.technowhub.ai` · Coolify (`159.69.240.1`) ·
Next.js 15 + Prisma + Postgres.

## Por onde começar

| Você quer… | Leia |
|---|---|
| Entender o sistema para mexer no código | [`CLAUDE.md`](CLAUDE.md) |
| Virar uma turma / subir campanha nova | [`docs/OPERACAO-CAMPANHA.md`](docs/OPERACAO-CAMPANHA.md) |
| Saber os identificadores de um produto | [`docs/PRODUCTS.md`](docs/PRODUCTS.md) |
| Padronizar UTM numa LP nova | [`docs/03-UTM-CONVENTION.md`](docs/03-UTM-CONVENTION.md) |

## Produtos monitorados

Fonte da verdade: [`lib/products.ts`](lib/products.ts). Hoje são 10:

| Slug | Produto | LP | Mídia paga |
|---|---|---|---|
| `claude-pro` | Curso Claude Pro | claude.impacta.com.br | Meta + Google |
| `peopleai` | People AI Lab | peopleai.impacta.com.br | Meta + Google |
| `codigozero` | Código Zero | codigozero.technowhub.ai | Meta + Google |
| `advia` | ADV-IA | advia.technowhub.ai | Meta + Google |
| `mba-academy` | MBA Academy AI Master | mbaacademy.technowhub.ai | — (orgânico/secretaria) |
| `qa-next` | QA Next | qanext.technowhub.ai | Meta + Google |
| `logica` | Lógica de Programação | impacta.com.br/cursos/logica/ | Meta + Google |
| `corporativo` | Corporativo (hub + IA) | corporate.technowhub.ai | — (leads via RD) |
| `mysql` | Formação MySQL Profissional | mysql.technowhub.ai | Meta + Google |
| `aicreator` | AI Creator | impacta.com.br/cursos/aicreator/ | Meta |

## Documentação

**Operação** (o que você usa no dia a dia)
- [Operação de campanha](docs/OPERACAO-CAMPANHA.md) — virada de turma, checklist dos 3 repos, mapa de LPs
- [Catálogo de produtos](docs/PRODUCTS.md) — identificadores em todas as fontes
- [Convenção UTM](docs/03-UTM-CONVENTION.md) — padrão obrigatório das LPs
- [Agente de insights](docs/AGENTE-INSIGHTS.md) · [Gestor de tráfego](docs/gestor-trafego-agente.md)
- [Segurança](docs/SECURITY.md) — segredos, superfície exposta, pendências

**Referência técnica**
- [Arquitetura](docs/01-ARCHITECTURE.md) · [Modelo de dados](docs/04-DATA-MODEL.md)
- [AI Insights](docs/05-AI-INSIGHTS.md) · [Design System](docs/06-DESIGN-SYSTEM.md)
- [Visão](docs/00-VISION.md) — o porquê do projeto

**Histórico** — [`docs/_arquivo/`](docs/_arquivo/) guarda documentos de estados
passados (plano de implantação, SQL aplicado à mão). Não são referência do hoje.

## Desenvolvimento

```bash
npm install
cp .env.example .env        # preencher DATABASE_URL e os segredos
docker compose up -d        # Postgres local
npx prisma migrate deploy
npm run dev
```

Migrations em produção **não** rodam no deploy — ver a seção de deploy em
[`CLAUDE.md`](CLAUDE.md).

## Princípios de produto

1. **Real-time-ish** — dados frescos em ≤ 5 min
2. **Proativo** — a IA chama atenção; humano decide
3. **Por produto** — o cockpit filtra por produto, e campanha é 1-para-1 com produto
4. **Multi-canal** — pago + orgânico + email num painel só
5. **APIs oficiais** — GA4 Data API, Google Ads API, Meta Marketing API
6. **Zero-config pra LP nova** — seguir a convenção UTM e cadastrar o produto
