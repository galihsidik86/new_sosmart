-- AlterEnum
ALTER TYPE "JournalSource" ADD VALUE 'SALDO_AWAL';

-- AlterTable
ALTER TABLE "item_stok_awal" ADD COLUMN     "saldo_awal_id" UUID;

-- AlterTable
ALTER TABLE "purchase_invoices" ADD COLUMN     "is_saldo_awal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "saldo_awal_id" UUID;

-- AlterTable
ALTER TABLE "sales_invoices" ADD COLUMN     "is_saldo_awal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "saldo_awal_id" UUID;

-- CreateTable
CREATE TABLE "saldo_awal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "cabang_id" UUID NOT NULL,
    "tanggal" DATE NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "total_debit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total_kredit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "posted_at" TIMESTAMP(3),
    "posted_by_id" UUID,
    "posted_requested_by_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saldo_awal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saldo_awal_akun_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "saldo_awal_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "nilai" DECIMAL(20,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saldo_awal_akun_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saldo_awal_tenant_id_key" ON "saldo_awal"("tenant_id");

-- CreateIndex
CREATE INDEX "saldo_awal_akun_lines_tenant_id_idx" ON "saldo_awal_akun_lines"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "saldo_awal_akun_lines_saldo_awal_id_account_id_key" ON "saldo_awal_akun_lines"("saldo_awal_id", "account_id");

-- CreateIndex
CREATE INDEX "purchase_invoices_tenant_id_is_saldo_awal_idx" ON "purchase_invoices"("tenant_id", "is_saldo_awal");

-- CreateIndex
CREATE INDEX "sales_invoices_tenant_id_is_saldo_awal_idx" ON "sales_invoices"("tenant_id", "is_saldo_awal");

-- AddForeignKey
ALTER TABLE "item_stok_awal" ADD CONSTRAINT "item_stok_awal_saldo_awal_id_fkey" FOREIGN KEY ("saldo_awal_id") REFERENCES "saldo_awal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saldo_awal" ADD CONSTRAINT "saldo_awal_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saldo_awal" ADD CONSTRAINT "saldo_awal_cabang_id_fkey" FOREIGN KEY ("cabang_id") REFERENCES "cabang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saldo_awal_akun_lines" ADD CONSTRAINT "saldo_awal_akun_lines_saldo_awal_id_fkey" FOREIGN KEY ("saldo_awal_id") REFERENCES "saldo_awal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saldo_awal_akun_lines" ADD CONSTRAINT "saldo_awal_akun_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saldo_awal_akun_lines" ADD CONSTRAINT "saldo_awal_akun_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_saldo_awal_id_fkey" FOREIGN KEY ("saldo_awal_id") REFERENCES "saldo_awal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_saldo_awal_id_fkey" FOREIGN KEY ("saldo_awal_id") REFERENCES "saldo_awal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
