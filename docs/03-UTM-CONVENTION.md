# 03 — Convenção UTM (obrigatória pra todas as LPs)

Sem isso, IRIS vira lixo em 3 meses. Esta é a "lei do reino" de todas as LPs do TechNow Hub.

## Padrão
```
{base_url}?utm_source={SOURCE}&utm_medium={MEDIUM}&utm_campaign={CAMPAIGN}&utm_content={CONTENT}&utm_term={TERM}
```

Todos os parâmetros em **kebab-case, minúsculo, sem acento**.

## Valores aceitos

### `utm_source` — de onde veio o tráfego
| Valor | Quando usar |
|---|---|
| `google` | Google Ads ou orgânico do Google |
| `meta` | Facebook + Instagram (Meta Ads ou orgânico) |
| `linkedin` | LinkedIn Ads ou orgânico |
| `tiktok` | TikTok Ads |
| `email` | Disparo de email (mailchimp, brevo, etc.) |
| `whatsapp` | Disparo direto WhatsApp |
| `direct` | Pessoa digitou URL ou veio sem referrer |
| `partner` | Parceiros institucionais (OAB, ABRH, Impacta, etc.) — usar `utm_term` pra identificar qual |
| `referral` | Site de terceiros que linkou pra LP |

### `utm_medium` — qual tipo de tráfego
| Valor | Quando usar |
|---|---|
| `cpc` | Pago por clique (Google Search, Meta) |
| `cpm` | Pago por mil impressões |
| `social` | Orgânico social (post, story sem boost) |
| `organic` | Busca orgânica (sem custo) |
| `email` | Newsletter, drip, disparo |
| `referral` | Link em outro site |
| `affiliate` | Programa de afiliados (futuro) |

### `utm_campaign` — qual produto + frente
**Padrão obrigatório**: `{produto-slug}-{frente}`

Exemplos:
- `direito5-launch` — campanha de lançamento
- `direito5-retarget` — remarketing
- `direito5-influencers` — influenciadores
- `peopleai-cold` — cold traffic
- `peopleai-warm` — warm traffic / retarget
- `peopleai-rh-publico` — segmento RH público

⚠️ Sempre começar pelo `produto-slug` cadastrado no IRIS — é o que permite agrupar tudo do mesmo produto.

### `utm_content` — qual peça/criativo específico
Identifica peça única. Útil pra A/B test.
- `hero-imagem-1` · `hero-imagem-2`
- `carrossel-vagas` · `carrossel-depoimentos`
- `video-30s-v1` · `video-30s-v2`
- `banner-300x250` · `banner-728x90`

### `utm_term` — público/palavra-chave
- Em **Search Ads**: a palavra-chave (Google preenche automaticamente com `{keyword}`)
- Em **Meta**: o público/segmento — ex: `lookalike-1pct-juristas`, `interesse-direito-digital`
- Em **partner**: identificador do parceiro — ex: `oab-sp`, `abrh-rj`

## Exemplos completos

```
# Google Search Ads pra Direito 5.0
https://direito5.technowhub.ai/?utm_source=google&utm_medium=cpc&utm_campaign=direito5-launch&utm_content=anuncio-toga-algoritmo&utm_term={keyword}

# Meta Ads pra People AI Lab, criativo carrossel, público RH lookalike
https://peopleai.technowhub.ai/?utm_source=meta&utm_medium=cpc&utm_campaign=peopleai-cold&utm_content=carrossel-vagas&utm_term=lookalike-1pct-rh

# Email marketing
https://direito5.technowhub.ai/?utm_source=email&utm_medium=email&utm_campaign=direito5-launch&utm_content=newsletter-2026-05-08

# Post orgânico no LinkedIn
https://direito5.technowhub.ai/?utm_source=linkedin&utm_medium=social&utm_campaign=direito5-launch&utm_content=post-organico-launch

# Parceria OAB/SP
https://direito5.technowhub.ai/?utm_source=partner&utm_medium=referral&utm_campaign=direito5-launch&utm_term=oab-sp
```

## Regras de governança

1. **Toda LP nova** entra primeiro no IRIS (cadastra produto), depois roda mídia.
2. **Toda peça paga** deve ter UTM completo — sem UTM, IRIS ignora e o tráfego vira "(direct/none)".
3. **Nomes em kebab-case, minúsculo, sem acento** — pra não fragmentar relatório.
4. **Sem espaços, ç ou caracteres especiais** — eles viram `%20` e `%C3%A7` e bagunçam.
5. **`utm_id`**: se Google Ads gerar automático, deixa — ele complementa sem prejudicar.
6. **Auto-tag no Google Ads**: pode manter (`gclid`); IRIS prioriza UTM mas usa `gclid` como fallback.

## UTM Builder (rotina interna no IRIS)
A partir do D2 do MVP, o IRIS terá uma tela `/utm-builder`:
- Dropdown produto (puxa do Postgres)
- Dropdowns source/medium (valores fixos da convenção)
- Texto livre pra `utm_content` e `utm_term`
- Output: URL final + botão "Copy"

Assim ninguém digita errado. Quem digitar manualmente errado, vai pra aba "(other)" do GA4 e o IRIS não consegue agrupar — fica claro o erro.

## Validação automática
O IRIS vai marcar como **inválido** qualquer tráfego que:
- Tenha `utm_campaign` que não bata com nenhum `Product.utmCampaignPrefix`
- Use valor de `utm_source` ou `utm_medium` fora da lista acima
- Tenha caracteres não-ASCII

Esses ficam num bucket "Tráfego não classificado" no cockpit, com link pra investigar.
