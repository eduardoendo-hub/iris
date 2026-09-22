# Operação de campanha

Como rodar uma campanha na IRIS: virar turma, subir produto novo e o que
quebra quando um passo é esquecido.

> **Fonte da verdade dos identificadores:** [`lib/products.ts`](../lib/products.ts).
> **Fonte da verdade da turma vigente:** o banco — a `Campaign` com `status=ACTIVE`
> do produto, editável em `/admin/campaigns`. Virar turma **não** deve exigir
> editar markdown de knowledge base.

---

## 1. Mapa: produto → LP → checkout

Cada produto tem um repo de LP próprio e um checkout Engaged. Os `sharedId`
abaixo são o que liga uma compra ao produto — quem resolve isso é o webhook
(`app/api/webhook/engaged/route.ts`).

| Produto | Repo da LP | Padrão de config | Lead → RD? |
|---|---|---|---|
| `claude-pro` | `~/claude-lp` | `tracking-config.json` + injectors | **sim** |
| `advia` | `~/advia-lp` | inline no `index.html` | **sim** |
| `codigozero` | `~/technow-social-engine/codigozero` | inline no `index.html` | **sim** |
| `peopleai` | `~/technow-social-engine/people-ai` | bundle gerado | **sim** |
| `corporativo` | `~/corporate` + `~/ia-corporate` | `app.js` (`CFG`) | **sim** |
| `qa-next` | `~/qa-next` | `app.js` (`CFG`) | não — venda direta |
| `logica` | `~/logica` | `app.js` (`CFG`) | não — venda direta |
| `mysql` | `~/mysql-lp` | `app.js` (`CFG`) | não — venda direta |
| `aicreator` | `~/aicreator` | `app.js` (`CFG`) | não — venda direta |
| `mba-academy` | `~/mbaacademy-experience-labs` | inline no `index.html` | não — venda direta |

**Três padrões de config** — saiba qual é o seu antes de editar:

- **`tracking-config.json` + injectors** (só `claude-lp`): edite o JSON e
  regenere o HTML. O Dockerfile roda os injectors no build, então em produção
  basta commitar o JSON; localmente:
  ```bash
  node inject-tracking.js && node inject-extras.js
  ```
- **`app.js`** com objeto `CFG` no topo: edite `PRODUCT_SLUG` / `CAMPAIGN_SLUG`
  direto ali.
- **inline no `index.html`**: o mesmo bloco de config, dentro do HTML.

---

## 2. Virar turma (checklist)

O caminho que mais dá problema. Faça na ordem — o passo 4 é o que "liga" tudo.

### 1. `~/iris/lib/products.ts`
Atualize o produto:
- `campaignSlug` → a turma nova (é o que vai no push de lead DRAFT para o RD CRM)
- `engagedCheckoutSharedIds` → **adicione** o sharedId novo **na frente**, sem
  remover os antigos. Os antigos seguram webhooks em trânsito de turmas
  anteriores; a campanha `ENDED` já barra compras novas no gate.
- `engagedProductIds` → preencha com o `product._id` do primeiro webhook de
  compra real do checkout novo (até lá, os antigos servem de fallback).

### 2. Repo da LP
Aponte a LP para a turma nova, conforme o padrão da tabela acima:
- `campaign_slug` / `CAMPAIGN_SLUG` → slug da turma nova
- URL do checkout → o `sharedId` novo
- datas, preço e lote na copy

### 3. `~/integracao-rd/app/campaigns/registry.py` — **só para LP com lead**
Adicione a entrada `CAMPAIGNS["<slug-da-turma>"]`.

> **Sem essa entrada, `/api/leads` responde 404 e os leads param de entrar.**
> Vale para `claude-pro`, `advia`, `codigozero` e `corporativo`. LPs de venda
> direta (`qa-next`, `logica`, `mysql`, `mba-academy`) não passam por aqui.

### ⚠️ Caso especial: remarcação que reusa a MESMA vaga do Engaged

O modelo pressupõe **um `sharedId` novo por turma**. Quando a turma é apenas
remarcada e o checkout do Engaged é reaproveitado (aconteceu com `claude-pro`
Turma 5/outubro herdando o `qnwmjm487q` da Turma 4/setembro), o mesmo `sharedId`
passa a existir em **duas** campanhas — a antiga `ENDED` e a nova `ACTIVE`.

Se a campanha antiga continuar com esse `sharedId` na lista, o webhook pode
resolver para ela e o gate `campaign_ended` **barra todo o tráfego do checkout**:
nenhum lead, nenhuma compra. O sintoma é "parou de entrar lead do Engaged" sem
nenhum erro visível.

**Ao remarcar reusando a vaga, remova o `sharedId` da campanha encerrada** —
ela mantém os números já registrados; o `sharedId` só precisa existir na turma
vigente. (O resolver também passou a preferir a campanha ATIVA, mas manter o
`sharedId` duplicado continua sendo ambíguo — limpe.)

### 4. `/admin/campaigns` na IRIS
Crie a `Campaign` nova com `status=ACTIVE` (ou clone a anterior):
- `startDate` / `endDate` — definem a **janela**, que é o escopo de todos os números
- metas e `marketingPlan` (injetado no prompt do agente como "plano da campanha vigente")
- `engagedCheckoutSharedIds` da turma
- turmas paralelas, se o produto vende mais de uma na mesma página (ver §4)

E **encerre a anterior** (`status=ENDED`): é isso que congela os números dela e
faz o webhook ignorar compras do sharedId antigo.

> Regra invariável: **uma campanha ACTIVE por produto**. É o que garante que a
> atribuição de lead por `productSlug` seja única.

### Verificação depois de virar

```bash
# a campanha nova está ativa e ingerindo?
curl -s -H "X-Admin-Secret: $IRIS_WEBHOOK_SECRET" \
  https://iris.technowhub.ai/api/admin/products | jq

# a LP está emitindo evento? (deve gravar VisitEvent)
# abra a LP e confira o POST para /api/events no devtools — 200, não 422/CORS
```

---

## 3. Produto novo (LP nova)

1. **LP** — seguir a [convenção UTM](03-UTM-CONVENTION.md) e emitir eventos para
   `https://iris.technowhub.ai/api/events` com `product_slug`.
2. **CORS** — adicionar a origem da LP em `ALLOWED_ORIGINS`
   (`app/api/events/route.ts`). **Sem isso o preflight bloqueia e nenhum evento
   chega** — e a LP não acusa erro visível.
3. **Vocabulário de eventos** — usar exatamente:
   `lp_view`, `click_compra`, `click_consultor`, `click_whats`, `lead_form`.
   Qualquer outro nome é rejeitado com 422.
4. **`lib/products.ts`** — cadastrar o produto (slug, LP, filtros Meta/Google,
   sharedIds) e espelhar em [PRODUCTS.md](PRODUCTS.md).
5. **`/admin`** — criar o `Product` (precisa de `ga4PropertyId` e
   `utmCampaignPrefix`) e a `Campaign` ACTIVE.
6. **Se tiver formulário de lead** — registrar o slug no `registry.py` do
   `integracao-rd`.
7. **Knowledge base** (opcional, para o agente de insights) —
   `lib/agent/knowledge/<slug>-product.md`, **evergreen**: estratégia, personas,
   benchmarks. Sem preço, datas, sharedId ou metas de turma.

---

## 4. Turmas paralelas

Quando a mesma LP vende mais de uma turma ao mesmo tempo (ex.: `logica` —
presencial e online ao vivo), cada turma vira uma `CampaignTurma` da campanha,
com seu próprio checkout. O de-para `sharedId → turma` vive na `CampaignTurma`;
em `lib/products.ts` vão **todos** os sharedIds do produto (é o filtro de
produto do webhook).

A `key` da turma é carimbada em `Sale.turmaKey` / `EngagedPurchase.turmaKey` —
**não renomeie a key de uma turma que já tem vendas** (o label pode mudar à
vontade). Ver `lib/campaign-turmas.ts`.

---

## 5. Cupom por URL nas LPs

O Engaged aplica desconto quando o link de checkout recebe **`?voucher_code=CODIGO`**
— e **só** esse parâmetro (`coupon`, `cupom`, `voucher` são ignorados).

Padrão adotado nas LPs: capturar `?cupom=` (aliases `coupon`, `voucher_code`)
**apenas da URL atual**, sem persistir em storage — entrar direto sem `?cupom=`
não deve aplicar desconto — e repassar como `voucher_code` no link do Engaged.

Snippets prontos: [`LP-COUPON-VOUCHER.html`](LP-COUPON-VOUCHER.html) (drop-in) e
[`LP-CHECKOUT-UTM-PATCH.js`](LP-CHECKOUT-UTM-PATCH.js) (UTM + cupom).

O código precisa existir e estar ativo no painel do Engaged — a LP só repassa.

---

## 6. Quando algo para de funcionar

| Sintoma | Causa provável |
|---|---|
| KPIs congelados, mas a LP tem tráfego | Sem `Campaign` ACTIVE cobrindo hoje → `getIngestGate` fecha o portão |
| Nenhum evento chega da LP nova | Origem fora de `ALLOWED_ORIGINS` (preflight bloqueado) |
| Evento rejeitado com 422 | `event_name` fora do vocabulário aceito |
| Leads pararam depois de virar turma | Falta a entrada no `registry.py` do `integracao-rd` → 404 em `/api/leads` |
| Compra não aparece / sem atribuição | `sharedId` novo ausente de `engagedCheckoutSharedIds`, ou campanha do sharedId já `ENDED` |
| **Parou de entrar lead/compra do Engaged de um dia pro outro** | Turma remarcada reusando a mesma vaga: o `sharedId` ficou em duas campanhas e o gate resolveu pela `ENDED`. Confira em `/api/debug/webhooks` se o `reason` é `campaign_ended:<turma-antiga>` |
| Insight diário não gerou para um produto | Produto sem campanha ACTIVE — o cron pula (e deve rodar **sem** `?product=`) |
