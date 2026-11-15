-- Expire unpaid orders whose inventory reservation was never linked to an active Stripe session.
ALTER TABLE "Order" ADD COLUMN "reservationExpiresAt" DATETIME;

CREATE INDEX "Order_status_paymentStatus_reservationExpiresAt_idx"
ON "Order"("status", "paymentStatus", "reservationExpiresAt");
