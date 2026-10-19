-- Inadimplência: a renovação sem pagamento tem 7 dias de tolerância (sistema liberado) contados a partir daqui.
ALTER TABLE "Subscription" ADD COLUMN "pastDueSince" DATETIME;
