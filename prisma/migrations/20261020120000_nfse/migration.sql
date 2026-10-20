-- NFS-e Padrão Nacional: dados do tomador (quem paga), notas por fatura e numeração das DPS.
CREATE TABLE "BillingCustomer" (
    "organizationId" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "zipCode" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "complement" TEXT,
    "neighborhood" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "ibge" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BillingCustomer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "NfseDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "billingInvoiceId" TEXT NOT NULL,
    "providerInvoiceId" TEXT NOT NULL,
    "ambiente" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "serie" INTEGER NOT NULL,
    "nDps" INTEGER,
    "dpsId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "competencia" DATETIME NOT NULL,
    "descricao" TEXT NOT NULL,
    "tomadorJson" TEXT,
    "chave" TEXT,
    "numero" TEXT,
    "dpsXml" TEXT,
    "nfseXml" TEXT,
    "eventoXml" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "issuedAt" DATETIME,
    "cancelMotivo" TEXT,
    "cancelReason" TEXT,
    "cancelRequestedAt" DATETIME,
    "canceledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "NfseDocument_billingInvoiceId_key" ON "NfseDocument"("billingInvoiceId");
CREATE UNIQUE INDEX "NfseDocument_dpsId_key" ON "NfseDocument"("dpsId");
CREATE UNIQUE INDEX "NfseDocument_chave_key" ON "NfseDocument"("chave");
CREATE INDEX "NfseDocument_status_nextAttemptAt_idx" ON "NfseDocument"("status", "nextAttemptAt");
CREATE INDEX "NfseDocument_organizationId_createdAt_idx" ON "NfseDocument"("organizationId", "createdAt");

CREATE TABLE "NfseSequence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "last" INTEGER NOT NULL DEFAULT 0
);
