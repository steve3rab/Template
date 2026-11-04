CREATE INDEX "Product_sellerId_stock_idx" ON "Product"("sellerId", "stock");

CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");
