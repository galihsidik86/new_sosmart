-- Approver per-individu: langkah aturan bisa menunjuk user spesifik.

ALTER TABLE "approval_rule_steps"
  ADD COLUMN "approver_user_id" UUID;

ALTER TABLE "approval_requests"
  ADD COLUMN "step_user_ids" TEXT NOT NULL DEFAULT '';
