-- CreateTable
CREATE TABLE "gl_config" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gl_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gl_config_tenant_id_idx" ON "gl_config"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "gl_config_tenant_id_key_key" ON "gl_config"("tenant_id", "key");

-- AddForeignKey
ALTER TABLE "gl_config" ADD CONSTRAINT "gl_config_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gl_config" ADD CONSTRAINT "gl_config_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
