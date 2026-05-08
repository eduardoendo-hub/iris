# 04 — Modelo de Dados

Schema base em Prisma. Todos os IDs são `cuid()`. Timestamps em UTC.

## Entidades

### `Product`
Uma LP/produto monitorado.

```prisma
model Product {
  id                  String   @id @default(cuid())
  slug                String   @unique           // "direito5"
  name                String                     // "Direito 5.0"
  url                 String                     // "https://direito5.technowhub.ai"

  // External IDs
  ga4PropertyId       String                     // "536394637"
  googleAdsCustomerId String?                    // sem traços, ex: "1234567890"
  metaAdAccountId     String?                    // "act_1234567890"
  symplaEventId       String?                    // ID Sympla
  gscSiteUrl          String?                    // "sc-domain:technowhub.ai"

  // UTM
  utmCampaignPrefix   String                     // "direito5"

  // Meta
  active              Boolean  @default(true)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  snapshots           Snapshot[]
  insights            Insight[]

  @@index([slug])
}
```

### `Snapshot`
Foto agregada de métricas num bucket de tempo, vinda de uma fonte.

```prisma
model Snapshot {
  id          String   @id @default(cuid())
  productId   String
  product     Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  bucket      Bucket                    // HOUR | DAY
  startsAt    DateTime                  // início do bucket (UTC)
  source      Source                    // GA4 | GOOGLE_ADS | META_ADS | SYMPLA | GSC
  channel     String?                   // "google/cpc", "organic/google", "meta/social", "(direct)/(none)"

  // Métricas (todas opcionais — depende da fonte)
  sessions    Int?
  users       Int?
  pageviews   Int?
  cost        Decimal? @db.Decimal(10,2)  // sempre BRL
  clicks      Int?                          // clicks pagos no anúncio (Ads, Meta)
  ctaClicks   Int?                          // clicks no botão da LP (GA4 event click_inscricao_sympla)
  ctaPosition String?                       // "header"|"hero"|"info"|"final"|"footer" (quando aplicável)
  impressions Int?
  conversions Int?                          // inscrições no Sympla quando integrado
  ctr         Decimal? @db.Decimal(5,4)
  cpc         Decimal? @db.Decimal(8,2)
  cpm         Decimal? @db.Decimal(8,2)

  rawJson     Json                         // payload bruto pra debug

  createdAt   DateTime @default(now())

  @@unique([productId, bucket, startsAt, source, channel, ctaPosition])
  @@index([productId, startsAt, source])
}

enum Bucket { HOUR DAY }
enum Source { GA4 GOOGLE_ADS META_ADS SYMPLA GSC }
```

### `Insight`
Output da camada AI — observação acionável.

```prisma
model Insight {
  id              String   @id @default(cuid())
  productId       String
  product         Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  generatedAt     DateTime @default(now())
  severity        Severity                  // INFO | WARN | HIGH | CRITICAL
  category        Category                  // ANOMALY | OPPORTUNITY | SUMMARY | FORECAST
  title           String                    // ≤ 80 chars
  body            String   @db.Text         // ≤ 300 chars (markdown permitido)
  recommendation  String?  @db.Text

  metricsRefs     Json                      // ids dos snapshots que motivaram
  contextHash     String                    // sha256(productId+title+date) — anti-duplicação

  acknowledgedAt  DateTime?
  acknowledgedBy  String?                   // userId

  pushSentAt      DateTime?
  emailSentAt     DateTime?

  @@unique([contextHash])
  @@index([productId, generatedAt])
}

enum Severity { INFO WARN HIGH CRITICAL }
enum Category { ANOMALY OPPORTUNITY SUMMARY FORECAST }
```

### `User`
Operador autorizado.

```prisma
model User {
  id                  String   @id @default(cuid())
  email               String   @unique
  name                String?
  image               String?
  role                Role     @default(VIEWER)

  notifyByEmail       Boolean  @default(true)
  notifyByWebPush     Boolean  @default(true)
  notifyByWhatsApp    Boolean  @default(false)
  whatsappNumber      String?

  createdAt           DateTime @default(now())
  lastSeenAt          DateTime @default(now())

  pushSubscriptions   PushSubscription[]
}

enum Role { VIEWER OPERATOR ADMIN }
```

### `PushSubscription`
Endpoint de Web Push do navegador do usuário.

```prisma
model PushSubscription {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  endpoint  String   @unique
  p256dh    String
  auth      String

  userAgent String?
  createdAt DateTime @default(now())
  lastUsed  DateTime @default(now())

  @@index([userId])
}
```

## Convenções gerais
- Todos timestamps em **UTC** no banco; UI converte pra `America/Sao_Paulo`
- `cost` sempre em **BRL** — Google Ads pode trazer USD; conversão na ingestão usando taxa do dia
- IDs externos (GA4 propertyId, Ads customerId) ficam no `Product`, NÃO no `Snapshot` (pra agrupar fácil)
- `Snapshot.rawJson` mantido sempre — pra debug e backfill se descobrirmos erro de ingestão
- Soft delete: `Product.active = false`, não deleta de verdade (preserva histórico)

## Estratégia de retenção
- `Snapshot` HOUR: 90 dias
- `Snapshot` DAY: 5 anos
- `Insight`: 5 anos (ou todo histórico)
- `rawJson` em snapshots > 30 dias: opcional purge se ocupar muito
- Job mensal de cleanup em `/api/cron/cleanup`

## Migrations
Cada mudança é uma migration Prisma versionada. Em produção: `prisma migrate deploy` rodando no startup do container Coolify.
