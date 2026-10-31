-- CRM: listas de empresas com escopo (equipe e vendedor) e contagens por empresa. Sem estes índices, o EXISTS de
-- "tem negócio ou pessoa dele" varria a empresa inteira para cada linha (3,5 s com 2 mil empresas e 10 mil pessoas).

-- CreateIndex
CREATE INDEX "CrmPerson_organizationId_companyId_idx" ON "CrmPerson"("organizationId", "companyId");

-- CreateIndex
CREATE INDEX "CrmDeal_organizationId_companyId_idx" ON "CrmDeal"("organizationId", "companyId");
