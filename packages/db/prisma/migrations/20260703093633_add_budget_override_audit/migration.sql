-- AlterTable
ALTER TABLE "journals"
  ADD COLUMN     "budget_overridden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN     "budget_override_alasan" TEXT;
