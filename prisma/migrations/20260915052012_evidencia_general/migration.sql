/*
  Warnings:

  - You are about to drop the `fotos_gps` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "fotos_gps" DROP CONSTRAINT "fotos_gps_cajero_id_fkey";

-- DropForeignKey
ALTER TABLE "fotos_gps" DROP CONSTRAINT "fotos_gps_placa_fkey";

-- AlterTable
ALTER TABLE "motocicletas" ADD COLUMN     "gps_correo" TEXT;

-- DropTable
DROP TABLE "fotos_gps";

-- CreateTable
CREATE TABLE "evidencias" (
    "id" TEXT NOT NULL,
    "entidad_tipo" TEXT NOT NULL,
    "entidad_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "contenido" BYTEA NOT NULL,
    "tipo_mime" TEXT NOT NULL,
    "descripcion" TEXT,
    "tomada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cajero_id" TEXT NOT NULL,

    CONSTRAINT "evidencias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evidencias_entidad_tipo_entidad_id_tomada_en_idx" ON "evidencias"("entidad_tipo", "entidad_id", "tomada_en");

-- AddForeignKey
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_cajero_id_fkey" FOREIGN KEY ("cajero_id") REFERENCES "cajeros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
