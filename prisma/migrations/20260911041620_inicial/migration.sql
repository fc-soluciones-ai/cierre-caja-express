-- CreateTable
CREATE TABLE "cajeros" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "rol" TEXT NOT NULL DEFAULT 'CAJERO',
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_hasta" TIMESTAMP(3),

    CONSTRAINT "cajeros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesiones" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "cajero_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "ultimo_uso" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispositivo" TEXT,

    CONSTRAINT "sesiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "choferes" (
    "id" TEXT NOT NULL,
    "id_mesero_softrestaurant" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombre_normalizado" TEXT NOT NULL,
    "foto_url" TEXT,
    "telefono" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "choferes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turnos_chofer" (
    "id" TEXT NOT NULL,
    "chofer_id" TEXT NOT NULL,
    "fecha_apertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_cierre" TIMESTAMP(3),
    "estado" TEXT NOT NULL DEFAULT 'ABIERTO',
    "candado_turno_abierto" TEXT,

    CONSTRAINT "turnos_chofer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abonos_efectivo" (
    "id" TEXT NOT NULL,
    "turno_chofer_id" TEXT NOT NULL,
    "monto_abonado" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cajero_id" TEXT NOT NULL,
    "dispositivo" TEXT,
    "nota" TEXT,
    "clave_idempotencia" TEXT,
    "anulado_por_id" TEXT,

    CONSTRAINT "abonos_efectivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cargas_excel" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo_corte" TEXT NOT NULL,
    "tipo_reporte" TEXT NOT NULL,
    "formato_detectado" TEXT NOT NULL,
    "hash_archivo" TEXT NOT NULL,
    "nombre_archivo" TEXT NOT NULL,
    "cajero_id" TEXT NOT NULL,
    "dia_operativo" TEXT NOT NULL,
    "filas_leidas" INTEGER NOT NULL,
    "filas_ignoradas" INTEGER NOT NULL,

    CONSTRAINT "cargas_excel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas_chofer_excel" (
    "id" TEXT NOT NULL,
    "carga_excel_id" TEXT NOT NULL,
    "chofer_id" TEXT,
    "id_mesero_excel" TEXT NOT NULL,
    "nombre_excel" TEXT NOT NULL,
    "efectivo" INTEGER NOT NULL,
    "tarjeta" INTEGER NOT NULL,
    "sinpe" INTEGER NOT NULL,
    "importe_total" INTEGER NOT NULL,
    "viajes" INTEGER NOT NULL,

    CONSTRAINT "ventas_chofer_excel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cierres_chofer" (
    "id" TEXT NOT NULL,
    "turno_chofer_id" TEXT NOT NULL,
    "carga_excel_id" TEXT,
    "cargas_consolidadas" TEXT NOT NULL DEFAULT '[]',
    "efectivo_esperado" INTEGER NOT NULL,
    "tarjeta_esperada" INTEGER NOT NULL,
    "sinpe_esperado" INTEGER NOT NULL,
    "viajes_totales" INTEGER NOT NULL,
    "abonos_parciales" INTEGER NOT NULL,
    "efectivo_entregado" INTEGER NOT NULL,
    "diferencia" INTEGER NOT NULL,
    "timestamp_cierre" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cajero_id" TEXT NOT NULL,
    "arqueo_caja_id" TEXT,
    "observacion" TEXT,

    CONSTRAINT "cierres_chofer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arqueos_caja" (
    "id" TEXT NOT NULL,
    "cajero_id" TEXT NOT NULL,
    "efectivo_teorico_caja" INTEGER NOT NULL,
    "efectivo_real_contado" INTEGER NOT NULL,
    "diferencia_caja" INTEGER NOT NULL,
    "desglose_denominaciones" TEXT,
    "observacion" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clave_idempotencia" TEXT,

    CONSTRAINT "arqueos_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tiquetes" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "contenido_texto" TEXT NOT NULL,
    "estado_impresion" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimo_error" TEXT,
    "copias" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abono_id" TEXT,
    "cierre_chofer_id" TEXT,
    "arqueo_caja_id" TEXT,

    CONSTRAINT "tiquetes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_auditoria" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo" TEXT NOT NULL,
    "cajero_id" TEXT,
    "chofer_id" TEXT,
    "entidad_tipo" TEXT,
    "entidad_id" TEXT,
    "monto" INTEGER,
    "detalle" TEXT,
    "dispositivo" TEXT,

    CONSTRAINT "eventos_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sesiones_token_hash_key" ON "sesiones"("token_hash");

-- CreateIndex
CREATE INDEX "sesiones_cajero_id_idx" ON "sesiones"("cajero_id");

-- CreateIndex
CREATE INDEX "sesiones_expira_en_idx" ON "sesiones"("expira_en");

-- CreateIndex
CREATE UNIQUE INDEX "choferes_id_mesero_softrestaurant_key" ON "choferes"("id_mesero_softrestaurant");

-- CreateIndex
CREATE INDEX "choferes_nombre_normalizado_idx" ON "choferes"("nombre_normalizado");

-- CreateIndex
CREATE INDEX "choferes_estado_idx" ON "choferes"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "turnos_chofer_candado_turno_abierto_key" ON "turnos_chofer"("candado_turno_abierto");

-- CreateIndex
CREATE INDEX "turnos_chofer_chofer_id_estado_idx" ON "turnos_chofer"("chofer_id", "estado");

-- CreateIndex
CREATE INDEX "turnos_chofer_fecha_apertura_idx" ON "turnos_chofer"("fecha_apertura");

-- CreateIndex
CREATE UNIQUE INDEX "abonos_efectivo_clave_idempotencia_key" ON "abonos_efectivo"("clave_idempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "abonos_efectivo_anulado_por_id_key" ON "abonos_efectivo"("anulado_por_id");

-- CreateIndex
CREATE INDEX "abonos_efectivo_turno_chofer_id_idx" ON "abonos_efectivo"("turno_chofer_id");

-- CreateIndex
CREATE INDEX "abonos_efectivo_timestamp_idx" ON "abonos_efectivo"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "cargas_excel_hash_archivo_key" ON "cargas_excel"("hash_archivo");

-- CreateIndex
CREATE INDEX "cargas_excel_dia_operativo_idx" ON "cargas_excel"("dia_operativo");

-- CreateIndex
CREATE INDEX "cargas_excel_timestamp_idx" ON "cargas_excel"("timestamp");

-- CreateIndex
CREATE INDEX "ventas_chofer_excel_chofer_id_idx" ON "ventas_chofer_excel"("chofer_id");

-- CreateIndex
CREATE UNIQUE INDEX "ventas_chofer_excel_carga_excel_id_id_mesero_excel_key" ON "ventas_chofer_excel"("carga_excel_id", "id_mesero_excel");

-- CreateIndex
CREATE UNIQUE INDEX "cierres_chofer_turno_chofer_id_key" ON "cierres_chofer"("turno_chofer_id");

-- CreateIndex
CREATE INDEX "cierres_chofer_timestamp_cierre_idx" ON "cierres_chofer"("timestamp_cierre");

-- CreateIndex
CREATE INDEX "cierres_chofer_cajero_id_idx" ON "cierres_chofer"("cajero_id");

-- CreateIndex
CREATE UNIQUE INDEX "arqueos_caja_clave_idempotencia_key" ON "arqueos_caja"("clave_idempotencia");

-- CreateIndex
CREATE INDEX "arqueos_caja_timestamp_idx" ON "arqueos_caja"("timestamp");

-- CreateIndex
CREATE INDEX "tiquetes_tipo_created_at_idx" ON "tiquetes"("tipo", "created_at");

-- CreateIndex
CREATE INDEX "tiquetes_estado_impresion_idx" ON "tiquetes"("estado_impresion");

-- CreateIndex
CREATE INDEX "eventos_auditoria_timestamp_idx" ON "eventos_auditoria"("timestamp");

-- CreateIndex
CREATE INDEX "eventos_auditoria_tipo_timestamp_idx" ON "eventos_auditoria"("tipo", "timestamp");

-- CreateIndex
CREATE INDEX "eventos_auditoria_chofer_id_timestamp_idx" ON "eventos_auditoria"("chofer_id", "timestamp");

-- AddForeignKey
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_cajero_id_fkey" FOREIGN KEY ("cajero_id") REFERENCES "cajeros"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos_chofer" ADD CONSTRAINT "turnos_chofer_chofer_id_fkey" FOREIGN KEY ("chofer_id") REFERENCES "choferes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonos_efectivo" ADD CONSTRAINT "abonos_efectivo_anulado_por_id_fkey" FOREIGN KEY ("anulado_por_id") REFERENCES "abonos_efectivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonos_efectivo" ADD CONSTRAINT "abonos_efectivo_turno_chofer_id_fkey" FOREIGN KEY ("turno_chofer_id") REFERENCES "turnos_chofer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonos_efectivo" ADD CONSTRAINT "abonos_efectivo_cajero_id_fkey" FOREIGN KEY ("cajero_id") REFERENCES "cajeros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargas_excel" ADD CONSTRAINT "cargas_excel_cajero_id_fkey" FOREIGN KEY ("cajero_id") REFERENCES "cajeros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas_chofer_excel" ADD CONSTRAINT "ventas_chofer_excel_carga_excel_id_fkey" FOREIGN KEY ("carga_excel_id") REFERENCES "cargas_excel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas_chofer_excel" ADD CONSTRAINT "ventas_chofer_excel_chofer_id_fkey" FOREIGN KEY ("chofer_id") REFERENCES "choferes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierres_chofer" ADD CONSTRAINT "cierres_chofer_turno_chofer_id_fkey" FOREIGN KEY ("turno_chofer_id") REFERENCES "turnos_chofer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierres_chofer" ADD CONSTRAINT "cierres_chofer_carga_excel_id_fkey" FOREIGN KEY ("carga_excel_id") REFERENCES "cargas_excel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierres_chofer" ADD CONSTRAINT "cierres_chofer_cajero_id_fkey" FOREIGN KEY ("cajero_id") REFERENCES "cajeros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierres_chofer" ADD CONSTRAINT "cierres_chofer_arqueo_caja_id_fkey" FOREIGN KEY ("arqueo_caja_id") REFERENCES "arqueos_caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arqueos_caja" ADD CONSTRAINT "arqueos_caja_cajero_id_fkey" FOREIGN KEY ("cajero_id") REFERENCES "cajeros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tiquetes" ADD CONSTRAINT "tiquetes_abono_id_fkey" FOREIGN KEY ("abono_id") REFERENCES "abonos_efectivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tiquetes" ADD CONSTRAINT "tiquetes_cierre_chofer_id_fkey" FOREIGN KEY ("cierre_chofer_id") REFERENCES "cierres_chofer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tiquetes" ADD CONSTRAINT "tiquetes_arqueo_caja_id_fkey" FOREIGN KEY ("arqueo_caja_id") REFERENCES "arqueos_caja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_auditoria" ADD CONSTRAINT "eventos_auditoria_cajero_id_fkey" FOREIGN KEY ("cajero_id") REFERENCES "cajeros"("id") ON DELETE SET NULL ON UPDATE CASCADE;
