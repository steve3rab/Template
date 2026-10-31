-- Add an explicit role; all existing accounts remain customers unless promoted by an operator.
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'CUSTOMER';
