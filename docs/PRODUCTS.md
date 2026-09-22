# IRIS — Catálogo de Produtos

Mapeia cada produto monitorado pela IRIS aos seus identificadores nas fontes de
dados (LP, Meta Ads, Google Ads, checkout Engaged).

## Fonte da verdade

[`lib/products.ts`](../lib/products.ts) — registro tipado, versionado em git,
lido por toda a lógica de filtro, ingest e atribuição. **Mude lá primeiro**,
depois espelhe aqui.

Para ver o registry rodando em produção:
```bash
curl -s -H "X-Admin-Secret: $IRIS_WEBHOOK_SECRET" \
  https://iris.technowhub.ai/api/admin/products | jq
```

**O que NÃO fica aqui:** pixel do Meta, measurement ID do GA4, preço e datas de
turma. Esses vivem no repo da LP (`tracking-config.json`, `app.js` ou inline no
`index.html`) e na `Campaign` do banco — duplicar aqui só cria documento velho.
O mapa produto → repo da LP está em [OPERACAO-CAMPANHA.md](OPERACAO-CAMPANHA.md).

---

## Visão geral

`campaignSlug` abaixo é o **default** do registry (usado no push de lead DRAFT
para o RD CRM). A turma que realmente vale a cada momento é a `Campaign` com
`status=ACTIVE` no banco.

| Slug | Produto | Filtro Meta/Google | campaignSlug (default) |
|---|---|---|---|
| `claude-pro` | Curso Claude Pro | `CLAUDEPRO` | `claude-pro-setembro-2026` |
| `peopleai` | People AI Lab | `PEOPLEAI` | `peopleai-julho-2026` |
| `codigozero` | Código Zero | `CODIGOZERO` | `codigozero-setembro-2026` |
| `advia` | ADV-IA | `ADVIA` | `advia-junho-2026` |
| `mba-academy` | MBA Academy AI Master | — (sem mídia paga) | `mba-academy-ai-master` |
| `qa-next` | QA Next | `QANEXT` | `qa-next-agosto-2026` |
| `logica` | Lógica de Programação | `LOGICA` | `logica-setembro-2026` |
| `corporativo` | Corporativo | `CORPORATIVO` | `corporativo` |
| `mysql` | Formação MySQL Profissional | `MYSQL` | `mysql-lancamento` |
| `aicreator` | AI Creator | `AICREATOR` (só Meta por ora) | `aicreator-outubro-2026` |

O filtro é uma **substring do nome da campanha** na plataforma — a convenção de
nomenclatura é `M1-PROSP-<FILTRO>-<MÊS><AA>` (Meta) e `G1-SEARCH-<FILTRO>-<MÊS><AA>`
(Google). Ex.: `M1-PROSP-CLAUDEPRO-SET26`.

---

## Checkouts Engaged

`sharedId` é o trecho após `/p/checkout/` na URL. É por ele que o webhook atribui
a compra. A lista é **cumulativa**: o mais novo entra na frente e os antigos
ficam para não perder webhooks em trânsito de turmas anteriores.

| Slug | sharedIds (mais novo primeiro) |
|---|---|
| `claude-pro` | `qnwmjm487q` (set) · `72rspa5wc8` (ago) · `x68jpj7w3k` (mai) |
| `peopleai` | `ligvw5t7yi` |
| `codigozero` | `qeuqyr0d3y` (turma 28/09) · `wpjw515nvn` (anteriores) |
| `advia` | `4jtt6rr7ti` |
| `mba-academy` | `w4uz6kh4cj` |
| `qa-next` | `tm8cdtdrbf` |
| `logica` | `se22shhnov` (presencial) · `3je9srypg3` (online ao vivo) |
| `mysql` | `nu3qkxhw84` |
| `aicreator` | `5ruizijtw3` |
| `corporativo` | — (não vende pelo Engaged; gera leads para o RD) |

`engagedProductIds` (o `product._id` do payload) é o fallback de atribuição
quando o sharedId não resolve. Hoje só `claude-pro` tem:
`6a208a4cccd3d6001cbf58dd`, `69fe28452501c7001ca77fe5`. Preencha os demais com
o `product._id` do primeiro webhook de compra real de cada checkout.

---

## Observações por produto

**`corporativo` — dois sites, um produto.** O hub (`corporate.technowhub.ai`) e a
página de IA (`ia-corporate.technowhub.ai`) reportam ambos
`product_slug='corporativo'`. Motivo: campanha é 1-para-1 com produto, e os KPIs
agregam por `product_slug` — é a única forma de ter uma campanha só somando as
duas páginas. A distinção entre elas se faz depois pelo `page_url` do
`VisitEvent`. No RD, porém, são dois slugs distintos: `corporativo` (hub) e
`corporativo-ia`.

**`logica` — primeira LP multi-turma.** A mesma página vende presencial e online
ao vivo, cada um com seu checkout. O de-para `sharedId → turma` fica na
`CampaignTurma`; aqui ficam os dois sharedIds. Ver §4 de
[OPERACAO-CAMPANHA.md](OPERACAO-CAMPANHA.md).

**`mba-academy` — sem mídia paga.** Distribuição orgânica/secretaria, por isso
não tem filtro Meta/Google (não há investimento para atribuir). Oferta interna:
aluno do MBA compra o Academy AI Master e abona as 64h de Experience Labs.

**`aicreator` — turma única, online ao vivo.** 6, 7 e 8/10/2026. Venda direta
(sem formulário de lead). A LP nasceu em `aicreator.technowhub.ai` e desde
09/2026 é servida em `impacta.com.br/cursos/aicreator/` (proxy) — é para lá que
os anúncios apontam. As duas origens estão em `ALLOWED_ORIGINS`. Sem mídia no
Google por ora (decisão de 09/2026); a tag global carrega sem registrar conversão.

**`mysql` e `qa-next` — venda direta.** Sem formulário de lead: WhatsApp e
checkout vão direto, sem passar pelo `integracao-rd`.

**`mysql` — `campaignSlug` genérico.** `mysql-lancamento` é só o default; as
campanhas reais chegam via `utm_campaign` da URL.

---

## Produto planejado

`direito5` (Direito 5.0) está comentado em `lib/products.ts` — sem campanha
ativa. Para reativar: descomentar o bloco, criar `Product` + `Campaign` no
`/admin` e seguir o passo a passo de produto novo em
[OPERACAO-CAMPANHA.md](OPERACAO-CAMPANHA.md).
