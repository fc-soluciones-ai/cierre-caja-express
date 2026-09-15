-- CreateTable
CREATE TABLE "fotos_chofer" (
    "chofer_id" TEXT NOT NULL,
    "contenido" BYTEA NOT NULL,
    "tipo_mime" TEXT NOT NULL,
    "actualizada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fotos_chofer_pkey" PRIMARY KEY ("chofer_id")
);

-- AddForeignKey
ALTER TABLE "fotos_chofer" ADD CONSTRAINT "fotos_chofer_chofer_id_fkey" FOREIGN KEY ("chofer_id") REFERENCES "choferes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
