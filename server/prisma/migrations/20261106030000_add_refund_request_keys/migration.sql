ALTER TABLE "FinancialTransaction" ADD COLUMN "requestKey" TEXT;
CREATE UNIQUE INDEX "FinancialTransaction_requestKey_key" ON "FinancialTransaction"("requestKey");
