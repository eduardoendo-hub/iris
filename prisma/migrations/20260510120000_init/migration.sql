-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Bucket" AS ENUM ('HOUR', 'DAY');

-- CreateEnum
CREATE TYPE "Source" AS ENUM ('GA4', 'GOOGLE_ADS', 'META_ADS', 'SYMPLA', 'GSC', 'RD_CRM');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INFO', 'WARN', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('ANOMALY', 'OPPORTUNITY', 'SUMMARY', 'FORECAST');

-- CreateEnum
CREATE TYPE "LeadEvent" AS ENUM ('FORM_SUBMIT', 'WHATSAPP_CLICK');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CHECKOUT_STARTED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('VIEWER', 'OPERATOR', 'ADMIN');

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "ga4PropertyId" TEXT NOT NULL,
    "googleAdsCustomerId" TEXT,
    "metaAdAccountId" TEXT,
    "symplaEventId" TEXT,
    "gscSiteUrl" TEXT,
    "utmCampaignPrefix" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "bucket" "Bucket" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "source" "Source" NOT NULL,
    "channel" TEXT,
    "ctaPosition" TEXT,
    "sessions" INTEGER,
    "users" INTEGER,
    "pageviews" INTEGER,
    "cost" DECIMAL(10,2),
    "clicks" INTEGER,
    "ctaClicks" INTEGER,
    "impressions" INTEGER,
    "conversions" INTEGER,
    "ctr" DECIMAL(5,4),
    "cpc" DECIMAL(8,2),
    "cpm" DECIMAL(8,2),
    "rawJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insight" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "severity" "Severity" NOT NULL,
    "category" "Category" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recommendation" TEXT,
    "metricsRefs" JSONB NOT NULL,
    "contextHash" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "pushSentAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),

    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "productSlug" TEXT NOT NULL,
    "campaignSlug" TEXT NOT NULL,
    "eventType" "LeadEvent" NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "perfil" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "sourcePage" TEXT,
    "rdCrmContactId" TEXT,
    "rdCrmDealId" TEXT,
    "rdCrmStatus" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "rawJson" JSONB NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "emailVerified" TIMESTAMP(3),
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "notifyByEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyByWebPush" BOOLEAN NOT NULL DEFAULT true,
    "notifyByWhatsApp" BOOLEAN NOT NULL DEFAULT false,
    "whatsappNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_slug_idx" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Snapshot_productId_startsAt_source_idx" ON "Snapshot"("productId", "startsAt", "source");

-- CreateIndex
CREATE UNIQUE INDEX "Snapshot_productId_bucket_startsAt_source_channel_ctaPositi_key" ON "Snapshot"("productId", "bucket", "startsAt", "source", "channel", "ctaPosition");

-- CreateIndex
CREATE UNIQUE INDEX "Insight_contextHash_key" ON "Insight"("contextHash");

-- CreateIndex
CREATE INDEX "Insight_productId_generatedAt_idx" ON "Insight"("productId", "generatedAt");

-- CreateIndex
CREATE INDEX "Lead_productSlug_capturedAt_idx" ON "Lead"("productSlug", "capturedAt");

-- CreateIndex
CREATE INDEX "Lead_campaignSlug_idx" ON "Lead"("campaignSlug");

-- CreateIndex
CREATE INDEX "Lead_rdCrmDealId_idx" ON "Lead"("rdCrmDealId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Insight" ADD CONSTRAINT "Insight_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

