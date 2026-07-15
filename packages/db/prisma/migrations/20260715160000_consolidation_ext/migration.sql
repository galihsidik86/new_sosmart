-- Eliminasi IC level-transaksi (partner tenant di customer/vendor) + goodwill.

ALTER TABLE "customers" ADD COLUMN "partner_tenant_id" UUID;
ALTER TABLE "vendors"   ADD COLUMN "partner_tenant_id" UUID;

ALTER TABLE "group_members"
  ADD COLUMN "acquisition_cost"       DECIMAL(20,2),
  ADD COLUMN "acquisition_net_assets" DECIMAL(20,2),
  ADD COLUMN "acquisition_date"       DATE;
