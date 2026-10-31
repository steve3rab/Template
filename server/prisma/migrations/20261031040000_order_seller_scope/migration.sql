-- Keep each seller's order view isolated for multi-vendor carts.
ALTER TABLE "Order" ADD COLUMN "sellerId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Order_sellerId_createdAt_idx" ON "Order"("sellerId", "createdAt");
