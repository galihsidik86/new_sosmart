-- AlterTable
ALTER TABLE "items" ADD COLUMN     "pph23_tarif_id" UUID;

-- CreateTable
CREATE TABLE "pph23_tarif" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "tarif" DECIMAL(5,2) NOT NULL,
    "keterangan" TEXT,
    "is_aktif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pph23_tarif_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pph23_tarif_tenant_id_idx" ON "pph23_tarif"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "pph23_tarif_tenant_id_kode_key" ON "pph23_tarif"("tenant_id", "kode");

-- AddForeignKey
ALTER TABLE "pph23_tarif" ADD CONSTRAINT "pph23_tarif_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_pph23_tarif_id_fkey" FOREIGN KEY ("pph23_tarif_id") REFERENCES "pph23_tarif"("id") ON DELETE SET NULL ON UPDATE CASCADE;
