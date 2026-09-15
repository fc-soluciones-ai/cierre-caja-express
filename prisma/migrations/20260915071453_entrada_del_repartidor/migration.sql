-- AlterTable
ALTER TABLE "choferes" ADD COLUMN     "bloqueado_hasta" TIMESTAMP(3),
ADD COLUMN     "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pin" TEXT;

-- AlterTable
ALTER TABLE "sesiones" ADD COLUMN     "chofer_id" TEXT,
ALTER COLUMN "cajero_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "sesiones_chofer_id_idx" ON "sesiones"("chofer_id");

-- AddForeignKey
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_chofer_id_fkey" FOREIGN KEY ("chofer_id") REFERENCES "choferes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
