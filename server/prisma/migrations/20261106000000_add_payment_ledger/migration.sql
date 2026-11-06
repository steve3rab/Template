CREATE TABLE "StripeWebhookEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "stripeEventId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "objectId" TEXT,
  "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" DATETIME
);
CREATE UNIQUE INDEX "StripeWebhookEvent_stripeEventId_key" ON "StripeWebhookEvent"("stripeEventId");
CREATE INDEX "StripeWebhookEvent_type_receivedAt_idx" ON "StripeWebhookEvent"("type", "receivedAt");
CREATE INDEX "StripeWebhookEvent_processedAt_idx" ON "StripeWebhookEvent"("processedAt");

CREATE TABLE "FinancialTransaction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "stripeObjectId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FinancialTransaction_stripeObjectId_key" ON "FinancialTransaction"("stripeObjectId");
CREATE INDEX "FinancialTransaction_orderId_createdAt_idx" ON "FinancialTransaction"("orderId", "createdAt");
CREATE INDEX "FinancialTransaction_type_createdAt_idx" ON "FinancialTransaction"("type", "createdAt");