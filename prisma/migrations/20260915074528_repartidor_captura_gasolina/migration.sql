-- DropForeignKey
ALTER TABLE "evidencias" DROP CONSTRAINT "evidencias_cajero_id_fkey";

-- AlterTable
ALTER TABLE "evidencias" ADD COLUMN     "chofer_id" TEXT,
ALTER COLUMN "cajero_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "registros_mantenimiento" ADD COLUMN     "chofer_id" TEXT,
ALTER COLUMN "cajero_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_cajero_id_fkey" FOREIGN KEY ("cajero_id") REFERENCES "cajeros"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_chofer_id_fkey" FOREIGN KEY ("chofer_id") REFERENCES "choferes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_mantenimiento" ADD CONSTRAINT "registros_mantenimiento_chofer_id_fkey" FOREIGN KEY ("chofer_id") REFERENCES "choferes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
