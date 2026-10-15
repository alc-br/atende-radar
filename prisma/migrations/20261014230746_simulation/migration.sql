-- S1 · Ambiente de simulação. Só acréscimos (o app anterior roda com este schema até reiniciar):
-- duas colunas com default em Organization, um índice e uma tabela nova.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "isSimulation" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN "simulationExpiresAt" DATETIME;

-- CreateIndex
CREATE INDEX "Organization_isSimulation_simulationExpiresAt_idx" ON "Organization"("isSimulation", "simulationExpiresAt");

-- CreateTable
CREATE TABLE "SimulationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL DEFAULT 'run',
    "scenarioId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "organizationId" TEXT,
    "virtualStart" DATETIME,
    "startedBy" TEXT NOT NULL,
    "resultJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "SimulationRun_createdAt_idx" ON "SimulationRun"("createdAt");

-- CreateIndex
CREATE INDEX "SimulationRun_scenarioId_createdAt_idx" ON "SimulationRun"("scenarioId", "createdAt");
