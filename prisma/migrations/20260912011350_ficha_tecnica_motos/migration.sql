-- AlterTable
ALTER TABLE "motocicletas" ADD COLUMN     "freno_delantero" TEXT,
ADD COLUMN     "freno_trasero" TEXT,
ADD COLUMN     "intervalo_aceite_km" INTEGER,
ADD COLUMN     "medida_cadena" TEXT,
ADD COLUMN     "medida_llanta_delantera" TEXT,
ADD COLUMN     "medida_llanta_trasera" TEXT,
ADD COLUMN     "presion_llantas_psi" TEXT,
ADD COLUMN     "tipo_aceite" TEXT,
ADD COLUMN     "vencimiento_rtv" TIMESTAMP(3),
ADD COLUMN     "vencimiento_seguro" TIMESTAMP(3);
