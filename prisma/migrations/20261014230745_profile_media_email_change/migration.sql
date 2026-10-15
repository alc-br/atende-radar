-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "logoType" TEXT;
ALTER TABLE "Organization" ADD COLUMN "logoUpdatedAt" DATETIME;

-- AlterTable
ALTER TABLE "OrganizationMember" ADD COLUMN "avatarType" TEXT;
ALTER TABLE "OrganizationMember" ADD COLUMN "avatarUpdatedAt" DATETIME;
ALTER TABLE "OrganizationMember" ADD COLUMN "pendingEmail" TEXT;
