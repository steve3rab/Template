-- Public user identifiers, product variants/media metadata and pending email verification.
ALTER TABLE "User" ADD COLUMN "publicId" TEXT NOT NULL DEFAULT '';
UPDATE "User"
SET "publicId" = 'USR-' || upper(substr(hex(randomblob(8)), 1, 12))
WHERE "publicId" = '';
CREATE UNIQUE INDEX "User_publicId_key" ON "User"("publicId");

ALTER TABLE "Product" ADD COLUMN "imageUrls" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Product" ADD COLUMN "sizes" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Product" ADD COLUMN "dimensions" TEXT NOT NULL DEFAULT '{}';

CREATE TABLE "RegistrationVerification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "RegistrationVerification_email_key" ON "RegistrationVerification"("email");
CREATE INDEX "RegistrationVerification_expiresAt_idx" ON "RegistrationVerification"("expiresAt");
