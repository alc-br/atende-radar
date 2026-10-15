-- B6 · Agrupamento de alertas: mesma conversa + mesma causa vira um alerta com contador.
-- Só ADD COLUMN (aditivo, sem recriar a tabela): o build anterior continua funcionando até o restart.
ALTER TABLE "Alert" ADD COLUMN "groupKey" TEXT;
ALTER TABLE "Alert" ADD COLUMN "occurrences" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Alert" ADD COLUMN "lastOccurredAt" DATETIME;
ALTER TABLE "Alert" ADD COLUMN "resolvedBy" TEXT;

-- Alertas antigos: a última ocorrência é a abertura.
UPDATE "Alert" SET "lastOccurredAt" = "createdAt" WHERE "lastOccurredAt" IS NULL;

CREATE INDEX "Alert_organizationId_groupKey_idx" ON "Alert"("organizationId", "groupKey");
