-- CreateTable
CREATE TABLE "motocicletas" (
    "placa" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "kilometraje_actual" INTEGER NOT NULL,
    "es_comodin" BOOLEAN NOT NULL DEFAULT false,
    "estado" TEXT NOT NULL DEFAULT 'OPERATIVA',
    "foto_url" TEXT,
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "motocicletas_pkey" PRIMARY KEY ("placa")
);

-- CreateTable
CREATE TABLE "asignaciones_moto" (
    "id" TEXT NOT NULL,
    "placa" TEXT NOT NULL,
    "chofer_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'FIJA',
    "fecha_inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_fin" TIMESTAMP(3),
    "motivo" TEXT,
    "candado_chofer_activo" TEXT,
    "candado_moto_activa" TEXT,

    CONSTRAINT "asignaciones_moto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registros_mantenimiento" (
    "id" TEXT NOT NULL,
    "placa" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "descripcion" TEXT,
    "costo_total" INTEGER NOT NULL,
    "kilometraje_evento" INTEGER NOT NULL,
    "taller_o_proveedor" TEXT,
    "comprobante_url" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cajero_id" TEXT NOT NULL,
    "clave_idempotencia" TEXT,

    CONSTRAINT "registros_mantenimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "motocicletas_estado_idx" ON "motocicletas"("estado");

-- CreateIndex
CREATE INDEX "motocicletas_es_comodin_idx" ON "motocicletas"("es_comodin");

-- CreateIndex
CREATE UNIQUE INDEX "asignaciones_moto_candado_chofer_activo_key" ON "asignaciones_moto"("candado_chofer_activo");

-- CreateIndex
CREATE UNIQUE INDEX "asignaciones_moto_candado_moto_activa_key" ON "asignaciones_moto"("candado_moto_activa");

-- CreateIndex
CREATE INDEX "asignaciones_moto_chofer_id_fecha_inicio_idx" ON "asignaciones_moto"("chofer_id", "fecha_inicio");

-- CreateIndex
CREATE INDEX "asignaciones_moto_placa_fecha_inicio_idx" ON "asignaciones_moto"("placa", "fecha_inicio");

-- CreateIndex
CREATE UNIQUE INDEX "registros_mantenimiento_clave_idempotencia_key" ON "registros_mantenimiento"("clave_idempotencia");

-- CreateIndex
CREATE INDEX "registros_mantenimiento_placa_timestamp_idx" ON "registros_mantenimiento"("placa", "timestamp");

-- CreateIndex
CREATE INDEX "registros_mantenimiento_categoria_timestamp_idx" ON "registros_mantenimiento"("categoria", "timestamp");

-- CreateIndex
CREATE INDEX "registros_mantenimiento_timestamp_idx" ON "registros_mantenimiento"("timestamp");

-- AddForeignKey
ALTER TABLE "asignaciones_moto" ADD CONSTRAINT "asignaciones_moto_placa_fkey" FOREIGN KEY ("placa") REFERENCES "motocicletas"("placa") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_moto" ADD CONSTRAINT "asignaciones_moto_chofer_id_fkey" FOREIGN KEY ("chofer_id") REFERENCES "choferes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_mantenimiento" ADD CONSTRAINT "registros_mantenimiento_placa_fkey" FOREIGN KEY ("placa") REFERENCES "motocicletas"("placa") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_mantenimiento" ADD CONSTRAINT "registros_mantenimiento_cajero_id_fkey" FOREIGN KEY ("cajero_id") REFERENCES "cajeros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

