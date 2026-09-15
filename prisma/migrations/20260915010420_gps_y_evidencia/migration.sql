-- AlterTable
ALTER TABLE "motocicletas" ADD COLUMN     "gps_identificador" TEXT,
ADD COLUMN     "gps_notas" TEXT,
ADD COLUMN     "gps_proveedor" TEXT,
ADD COLUMN     "gps_revisado_en" TIMESTAMP(3),
ADD COLUMN     "tiene_gps" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "fotos_gps" (
    "id" TEXT NOT NULL,
    "placa" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "contenido" BYTEA NOT NULL,
    "tipo_mime" TEXT NOT NULL,
    "descripcion" TEXT,
    "tomada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cajero_id" TEXT NOT NULL,

    CONSTRAINT "fotos_gps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fotos_gps_placa_tomada_en_idx" ON "fotos_gps"("placa", "tomada_en");

-- AddForeignKey
ALTER TABLE "fotos_gps" ADD CONSTRAINT "fotos_gps_placa_fkey" FOREIGN KEY ("placa") REFERENCES "motocicletas"("placa") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fotos_gps" ADD CONSTRAINT "fotos_gps_cajero_id_fkey" FOREIGN KEY ("cajero_id") REFERENCES "cajeros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
