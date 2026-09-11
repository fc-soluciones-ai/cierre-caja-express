# Cierre Caja Express — Arquitectura

Sistema de recepción parcial de efectivo y cierre de turno para repartidores
express, conciliado contra los reportes de venta por mesero de Soft Restaurant
(National Soft).

---

## 1. Decisiones de arquitectura

| Decisión | Elección | Motivo |
|---|---|---|
| Framework | Next.js 14 (App Router) + TypeScript | Un solo proceso sirve la UI táctil y la API. En una pizzería no hay quien administre dos servicios. |
| UI | Tailwind CSS, objetivos táctiles de 64 px mínimo | Se opera con el dedo, en un monitor POS, muchas veces con guantes. |
| ORM | Prisma | Migraciones versionadas y tipos generados desde el esquema. |
| Base de datos | SQLite en un punto de caja, PostgreSQL si hay varios | Cambiar de motor es un bloque `datasource`. El esquema no usa nada exclusivo de un motor. |
| Excel | SheetJS (`xlsx`) | Único paquete que lee el BIFF antiguo de `.xls` que exporta Soft Restaurant, además de `.xlsx`. |
| Impresión | ESC/POS crudo por socket TCP al puerto 9100 | No depende del driver de Windows ni de un diálogo de impresión que bloquee la pantalla táctil. |

### Por qué el servidor manda

Toda operación con dinero (abono, cierre, arqueo) se ejecuta en el servidor
dentro de una transacción y queda firmada por un cajero. El cliente táctil no
calcula saldos: los pide. Si dos cajas tocan al mismo chofer, la base de datos
decide, no el orden en que llegaron los clics.

---

## 2. Tres invariantes que el resto del sistema da por ciertas

**1. El dinero es un entero en céntimos.** Nunca un `Float`. CRC tiene
exponente ISO 4217 de 2, así que ₡12.500 se guarda como `1250000`. El factor
sale de una tabla de exponentes, no de un `× 100` reflejo. Un arqueo de caja
con aritmética de punto flotante acumula errores de céntimos que luego nadie
puede explicar. Toda la conversión vive en `src/lib/money/money.ts`.

**2. No se guardan saldos acumulados.** El saldo de abonos de un chofer y el
widget de efectivo en caja son sumas derivadas (`SUM` sobre `abonos_efectivo`).
Un contador denormalizado sería una segunda fuente de verdad que se
desincroniza en cuanto se anula un abono.

**3. Los registros de dinero no se editan ni se borran.** Una corrección se
asienta como un movimiento de reverso enlazado al original mediante
`anulado_por_id`. La tabla `eventos_auditoria` es append-only y es la fuente
de la pantalla de historial.

---

## 3. Estructura de carpetas

```
Cierre Caja Expres/
├── prisma/
│   ├── schema.prisma            # Esquema completo, comentado
│   └── seed/seed.ts             # Cajero inicial y choferes de ejemplo
├── docs/
│   ├── ARQUITECTURA.md          # Este documento
│   └── RESPALDOS.md             # Respaldo, restauración y tarea programada
├── scripts/
│   ├── verificar-parser.ts      # Parser de Excel y aritmética de moneda
│   ├── verificar-esquema.ts     # Garantías de integridad de la base
│   ├── verificar-servicios.ts   # Jornada completa de punta a punta
│   ├── verificar-respaldo.ts    # Ciclo de respaldo y restauración
│   ├── probar-impresora.ts      # Muestrario de las cuatro plantillas
│   ├── respaldar.ts             # Copia verificada de la base
│   ├── restaurar.ts             # Restauración con red de seguridad
│   └── respaldo-diario.cmd      # Envoltorio para el Programador de tareas
├── respaldos/                   # Copias verificadas (fuera de git)
├── public/choferes/             # Fotos de los repartidores
└── src/
    ├── app/
    │   ├── layout.tsx           # Tema oscuro, zoom bloqueado
    │   ├── globals.css          # Objetivos táctiles y cifras tabulares
    │   ├── acciones.ts          # Acciones de servidor del dashboard
    │   ├── page.tsx             # Módulo 1: dashboard táctil
    │   ├── entrar/              # Identificación del cajero por PIN
    │   ├── importar/            # Módulo 3: carga de Excel
    │   ├── cierre/              # Módulo 3: conciliación
    │   ├── historial/           # Módulo 5: auditoría y reportería
    │   └── choferes/            # Módulo 4: CRUD de repartidores
    ├── components/
    │   ├── Numpad.tsx           # Teclado táctil, sirve para monto y PIN
    │   ├── ModalAbono.tsx       # Módulo 2
    │   ├── ModalMonto.tsx       # Captura de monto sin llamar al servidor
    │   ├── ModalEntradaTurno.tsx # Marcar quién trabaja esta noche
    │   ├── ImportadorExcel.tsx  # Módulo 3, carga
    │   ├── PanelCierre.tsx      # Módulo 3, conciliación
    │   ├── PanelChoferes.tsx    # Módulo 4
    │   ├── PanelHistorial.tsx   # Módulo 5
    │   ├── GrillaChoferes.tsx   # Tarjetas de repartidor
    │   ├── BarraSuperior.tsx    # Widget de caja y accesos rápidos
    │   └── FormularioEntrada.tsx
    ├── lib/
    │   ├── db/prisma.ts         # Cliente único
    │   ├── excel/
    │   │   ├── columnas.ts      # Detección de encabezado y sinónimos
    │   │   ├── parser.ts        # Lectura de los dos formatos
    │   │   └── consolidar.ts    # Fusión Blanco + Negro + parciales
    │   ├── money/money.ts       # Céntimos, formato, conciliación, arqueo
    │   ├── fechas.ts            # Día operativo que cruza la medianoche
    │   └── print/
    │       ├── documento.ts     # Bloques, render a texto y a ESC/POS
    │       ├── plantillas.ts    # Los cuatro tiquetes
    │       └── impresora.ts     # Envío por socket TCP al puerto 9100
    ├── server/
    │   ├── errores.ts           # Errores de negocio con código
    │   ├── validaciones.ts      # Esquemas Zod de toda entrada
    │   └── services/
    │       ├── abonos.ts        # Módulo 2, con idempotencia y reverso
    │       ├── arqueos.ts       # Arqueo independiente
    │       ├── auditoria.ts     # Bitácora append-only
    │       ├── caja.ts          # Saldos derivados
    │       ├── cargas.ts        # Importación en dos pasos
    │       ├── cierres.ts       # Módulo 3, conciliación transaccional
    │       ├── choferes.ts      # Módulo 4
    │       ├── exportar.ts      # Reporte a Excel
    │       ├── fotos.ts         # Fotos validadas por sus bytes
    │       ├── historial.ts     # Módulo 5, solo lectura
    │       ├── pin.ts           # Derivación scrypt del PIN
    │       ├── respaldo.ts      # VACUUM INTO, verificación y retención
    │       ├── sesion.ts        # Cookie de sesión del cajero
    │       └── turnos.ts        # Apertura implícita y candado
    └── types/enums.ts           # Valores válidos de las columnas tipo enum
```

---

## 4. Modelo de datos

Nueve tablas. Las seis del requerimiento más tres que la operación exige.

| Tabla | Rol |
|---|---|
| `cajeros` | Firma de toda escritura de dinero. `cajero_id` se pedía en el requerimiento pero la tabla no existía. |
| `choferes` | Repartidor. `id_mesero_softrestaurant` es la llave de cruce con el Excel. |
| `turnos_chofer` | Un turno por chofer por jornada. |
| `abonos_efectivo` | Entregas parciales durante el turno. |
| `cargas_excel` | Un archivo importado. `hash_archivo` único. |
| `ventas_chofer_excel` | Totales por chofer de **una** carga. Permite consolidar varios archivos sin releerlos y deja ver qué aportó cada uno. |
| `cierres_chofer` | Conciliación final, inmutable. |
| `arqueos_caja` | Conteo físico de la caja. |
| `tiquetes` | Documento del tiquete congelado en JSON, para reimprimir idéntico. |
| `eventos_auditoria` | Bitácora append-only del módulo 5. |

### El candado de turno abierto

`turnos_chofer.candado_turno_abierto` vale `chofer_id` mientras el turno está
abierto y `NULL` cuando se cierra, con índice único. Como los `NULL` no
colisionan en un índice único, la base de datos garantiza por sí sola un solo
turno abierto por chofer. Es la diferencia entre una regla que se cumple y un
`if` que alguien olvidará poner en el segundo endpoint.

### Fórmula de conciliación

```
diferencia = (abonos_parciales + efectivo_entregado) − efectivo_esperado
```

Positiva es sobrante, negativa es faltante. El signo se decide una sola vez,
en `calcularDiferencia`, y la UI solo lo pinta.

---

## 5. Ingesta de Excel

Los `.xls` de Soft Restaurant no son una tabla limpia: traen el nombre del
restaurante, el rango de fechas y filas en blanco antes de los títulos reales,
y los títulos cambian de redacción entre versiones.

El parser no asume una fila fija. Explora las primeras 30 filas, puntúa cada
una contra una lista de sinónimos por campo y toma la que reconozca más
columnas, exigiendo un mínimo de tres para no confundir un subtítulo con los
títulos.

**El formato se decide por las columnas presentes, no por el nombre del
archivo**, porque el operador los renombra a diario:

- Si aparece `numcheque` → **detallado**: una fila por cheque, hay que agrupar.
- Si aparece `nopersonas` → **consolidado**: una fila por mesero, ya sumada.

En el detallado los viajes se cuentan como **cheques distintos**, no como
filas. Un pedido pagado con dos medios genera dos filas del mismo `numcheque`
y contarlas por separado inflaría los viajes del repartidor.

### Consolidación

`consolidarArchivos` suma varios archivos por chofer, cruzando por `idmesero`
cuando existe y por nombre normalizado cuando el reporte no lo trae. Si el
mismo chofer entró primero por nombre y luego por id, las dos entradas se
fusionan.

Dos defensas activas:

- Un archivo con el mismo SHA-256 que otro ya cargado se descarta y se avisa.
- Cargar un corte `PARCIAL` junto al `TOTAL` del mismo tipo de reporte levanta
  una advertencia por doble conteo. Advierte, no bloquea: hay operaciones donde
  el total solo cubre la segunda mitad del turno, y esa es decisión del cajero.

---

## 6. Servicios transaccionales

Cada operación con dinero es una transacción única que abarca el movimiento,
su asiento en la bitácora y el tiquete. Si algo falla, no queda nada a medias.

**El dashboard muestra solo a quien está en turno.** No todos trabajan todos
los días, y una pantalla con las quince tarjetas del padrón obliga a buscar a
la una de la mañana en vez de tocar. El cajero marca la entrada cuando el
repartidor llega, y vuelve a abrir esa lista cuando llega alguien más en hora
pico.

**"Activo" y "en turno" son cosas distintas.** Activo, en la ficha del
repartidor, significa que trabaja en el negocio. En turno significa que trabaja
esta noche. La pantalla de gestión maneja lo primero y el dashboard lo segundo.

**El turno también se abre solo si hace falta.** Si llega un abono de alguien a
quien nadie marcó la entrada, el turno aparece igual. Es la red de seguridad:
el dinero nunca se queda sin dónde registrarse por un olvido.

**Una entrada marcada por error se deshace, pero solo si no recibió dinero.**
En cuanto hay un abono, el turno deja de ser un error de digitación y pasa a ser
un movimiento de caja: se cierra por la pantalla de cierre, no se borra.

**El doble toque no cobra dos veces.** El cliente manda una llave de
idempotencia generada con `crypto.randomUUID()`. Si la misma llave vuelve, se
devuelve el abono original sin sumar ni volver a imprimir. En una pantalla
táctil el doble toque no es una hipótesis, es lo normal.

**Un abono no se edita, se reversa.** La anulación crea una fila de monto
negativo enlazada a la original. El saldo sigue siendo una suma simple y el
historial conserva las dos caras del error.

**No se cierra sin el Excel cargado.** Cerrar antes de importar el reporte
registraría todo lo entregado como sobrante y falsearía el arqueo. Existe un
cierre forzado explícito, porque a veces hay que liquidar a alguien antes de
que el reporte esté disponible, y negarlo solo lograría que el cierre se
hiciera fuera del sistema.

**El arqueo se calcula después de los cierres**, porque el efectivo que el
repartidor acaba de entregar ya está en la gaveta cuando el cajero la cuenta.

**La impresión ocurre fuera de la transacción.** El dinero ya entró; una
impresora apagada no puede deshacer un movimiento correcto. El tiquete queda
en cola y se reimprime cuando la impresora vuelve.

---

## 7. Tiquetes térmicos

Un tiquete se guarda como documento de bloques en JSON, no como bytes ni como
datos de origen. Los bytes no se pueden mostrar en pantalla, y guardar los
datos haría que una reimpresión saliera distinta si mañana cambia la
plantilla. Del documento salen las dos representaciones: texto plano de 48
columnas para la vista previa y ESC/POS para el papel.

Los montos van sin símbolo de moneda. El colón (U+20A1) no existe en ninguna
página de códigos de las impresoras térmicas y saldría como basura, así que la
moneda se declara una vez en el encabezado.

Cuatro plantillas: abono parcial, cierre de turno, arqueo de caja y cierre
grupal. Se revisan sin hardware con `npm run print:probar`.

---

## 8. Interfaz táctil

**Se entra con PIN antes de ver nada.** Todo abono y todo cierre queda firmado,
y una firma que el navegador pueda elegir no vale nada. El cajero sale de la
cookie de sesión en el servidor, nunca de lo que mande el cliente.

**El teclado numérico es uno solo.** El mismo componente teclea el monto de un
abono y el PIN de entrada. Las teclas miden 80 px porque el operador escribe
con el dedo, a veces con guante, y una tecla de tamaño de escritorio produce
errores de digitación que después aparecen como faltantes de caja.

**Se teclean colones enteros, no céntimos.** Nadie entrega monedas de céntimo,
y obligar a teclear dos ceros por monto sería una fuente constante de errores.
La conversión ocurre en un solo lugar, al confirmar.

**La clave de idempotencia se fija al abrir el modal** y no cambia mientras
siga abierto. Ese es el detalle que evita cobrar dos veces cuando el dedo
rebota sobre Confirmar.

**Los atajos de teclado leen de referencias, no del estado.** Si dependieran
del estado de React, teclear el monto y pulsar Enter de inmediato dejaría al
oyente con el valor anterior todavía en cero. En una caja se teclea así de
rápido, y el fallo apareció en la primera prueba real.

**El zoom táctil está bloqueado.** Un pellizco accidental a media noche deja
la pantalla inservible hasta que alguien sepa deshacerlo.

**Si el tiquete no sale, la pantalla lo dice.** El abono queda registrado
igual, pero decir que el papel salió cuando no salió haría que el cajero no lo
reimprimiera. Lo mismo en el cierre, que informa cuántos de sus tiquetes
salieron de verdad.

---

## 9. Importación y cierre

**La importación va en dos pasos.** Primero se lee el archivo y se muestra a
qué repartidor se imputa cada línea; solo después se escribe. Un mesero mal
cruzado produce un faltante que aparece al cierre y que nadie sabe explicar.

**El archivo se envía dos veces**, una para previsualizar y otra para
confirmar, en vez de guardarse en el servidor entre los dos pasos. Un archivo
temporal habría que limpiarlo, protegerlo y decidir qué hacer si la caja se
reinicia a media carga. Releer 100 KB es más barato que todo eso.

**El lote entra completo o no entra.** Si el tercer archivo está repetido, los
dos primeros tampoco entran: media carga aplicada haría cerrar turnos contra un
esperado incompleto sin que nadie lo note.

**La clasificación no se adivina del nombre del archivo.** El operador los
renombra a diario, así que Blanco o Negro y total o parcial los marca él.

**Las cuentas del punto de venta se reconocen y se dejan pasar en silencio.**
Soft Restaurant clasifica como repartidor a cuentas que no son personas, como
la de pedidos para llevar. Aparecen en el reporte pero nadie las liquida, así
que se listan en gris en vez de levantar la alerta de mesero sin registrar. Un
aviso diario que el cajero aprende a ignorar deja de servir el día que falta un
repartidor de verdad. La lista vive en `src/server/config/cuentasDelPos.ts`.

**Las cuentas del punto de venta se reconocen y se dejan pasar en silencio.**
Soft Restaurant clasifica como repartidor a cuentas que no son personas, como
las de pedidos para llevar. Aparecen en el reporte pero nadie las liquida, así
que se listan en gris en vez de levantar la alerta de mesero sin registrar. Un
aviso diario que el cajero aprende a ignorar deja de servir el día que falta un
repartidor de verdad. La lista vive en .

**La diferencia del cierre se calcula en vivo en el cliente, pero la que queda
asentada la recalcula el servidor.** Entre que se pinta la pantalla y se pulsa
Confirmar, otra caja puede haber recibido un abono más.

**El arqueo suma las entregas de este cierre antes de compararse.** El efectivo
que el repartidor acaba de entregar ya está en la gaveta cuando el cajero la
cuenta.

---

## 10. Repartidores e historial

**Un repartidor no se borra, se desactiva.** Sus turnos y cierres son historia
contable, y las llaves foráneas están en Restrict para que un clic no pueda
romperla. Tampoco se desactiva a alguien con turno abierto: dejaría abonos
colgando de un turno que ya nadie puede cerrar.

**La foto se valida por sus bytes, no por su extensión.** El nombre y el
Content-Type los controla quien sube el archivo, y esa carpeta la sirve el
servidor web tal cual. El nombre guardado lleva un sufijo aleatorio para que al
cambiar la foto el navegador no siga mostrando la anterior desde su caché.

**El historial solo lee.** No hay una sola escritura en su servicio. Corregir
la bitácora tendría que ser un evento nuevo, nunca la edición de uno viejo.

**Las métricas no salen de la bitácora sino de los cierres.** Un evento guarda
el monto de su movimiento, no el desglose por medio de pago: sumar eventos daría
el efectivo pero nunca la tarjeta ni el SINPE.

**Los filtros viven en la URL.** Así una consulta como "Toño, últimos cuatro
días" sobrevive a una recarga y se puede pasar a otra persona como enlace.

**El Excel exportado lleva números, no texto formateado.** Quien abre el reporte
va a querer sumar columnas, y una columna de texto con separador de miles no se
suma. El formato de moneda va como formato de celda.

---

## 11. Flota de motocicletas

El módulo vive aparte del dinero: comparte los repartidores y el cajero que
registra, pero ningún cálculo de caja depende de él.

### Tres tablas

`motocicletas` se identifica por la placa, no por un identificador inventado:
la placa ya es única y es lo que la gente dice en voz alta. Se guarda
normalizada, sin espacios ni guiones, así que «mot-555 b» y «MOT555B» son la
misma moto.

`asignaciones_moto` es un historial, no un estado. La asignación vigente es la
que no tiene fecha de fin. Dos columnas únicas anulables impiden a nivel de
base de datos que un repartidor traiga dos motos o que una moto la traigan
dos personas, por el mismo mecanismo que el candado de turno abierto.

`registros_mantenimiento` es la bitácora de gastos. Cada fila lleva el
odómetro del momento, y ese número es el que gobierna las alertas.

### El odómetro solo sube

Registrar un gasto actualiza el kilometraje de la moto, y el servicio rechaza
un número menor al que ya tenía. Sin esa regla, bastaría con teclear un
kilometraje bajo para que una alerta de servicio vencido desapareciera.

### Reemplazo por comodín

Cuando una moto sale de circulación, su repartidor recibe la comodín. El
requerimiento no decía qué hacer en tres casos, y los tres están resueltos y
cubiertos por pruebas:

1. **La comodín ya está prestada.** El cambio de estado no se bloquea, pero la
   pantalla avisa con nombre y apellido que ese repartidor queda sin moto. Es
   una decisión de la persona, no del sistema.
2. **La moto vuelve del taller.** Se le devuelve a su dueño y la comodín queda
   libre, lista para el siguiente.
3. **Se avería la comodín.** No se reemplaza a sí misma; se avisa igual.

### Semáforo

El tablero pinta cada moto de verde, amarillo o rojo. El estado pesa más que
el kilometraje: una moto en el taller es roja aunque le acaben de cambiar el
aceite. El texto del estado lleva su propio color, porque decir «Operativa» en
rojo se lee como si la moto no sirviera.

Los intervalos son 2.000 km para el aceite y 10.000 km para frenos y llantas,
con aviso al 85 %. Una moto sin ningún servicio registrado cuenta desde cero:
está vencida, no exenta.

### Costo por kilómetro

Sale del rango de odómetro que cubren los propios registros del período, no
del kilometraje total de la moto. Mezclarlos repartiría el gasto de un mes
entre los kilómetros de toda la vida de la moto. Con un solo registro no hay
recorrido que medir y la columna dice «sin datos», que no es lo mismo que
cero: cero significaría que rodar no cuesta nada.

---

## 12. Estado actual

Terminado y verificado con 185 comprobaciones automáticas más pruebas manuales
en el navegador:

- Esquema completo y garantías de integridad de la base.
- Moneda en céntimos, día operativo que cruza la medianoche.
- Parser de los dos formatos de Excel y consolidación multiarchivo.
- Servicios de abono, anulación, carga, cierre, arqueo y CRUD de choferes.
- Las cuatro plantillas de tiquete y el cliente de impresión.
- Entrada por PIN, dashboard táctil y recepción de abonos parciales.
- Importación de Excel con arrastrar y soltar, previsualización y consolidación.
- Cierre con selección múltiple, diferencia en vivo y arqueo de caja.
- CRUD de repartidores con foto, y bloqueo de bajas con turno abierto.
- Historial filtrable, métricas, ficha de detalle, reimpresión y exportación.
- Respaldo verificado, restauración con red de seguridad y aviso en pantalla
  cuando la copia se atrasa.
- Flota de motos: tablero con semáforo, préstamo automático de la comodín,
  registro táctil de gastos y reportería con costo por kilómetro.

Los cinco módulos del requerimiento están construidos, más el de flota.

### Cómo probar sin tocar la contabilidad

`npm run demo` levanta la aplicación en el puerto 3100 contra el esquema de
pruebas, con su propia carpeta de compilación para poder correr a la vez que
el servidor de trabajo. `npm run demo:flota` le pone una flota de ejemplo.
Sirve para enseñar el sistema o entrenar a alguien.

Queda por decidir con el negocio:

1. **Corte de caja por cambio de cajero.** El efectivo teórico acumula todo el
   día operativo y un arqueo no lo reinicia. Si en su operación la caja cambia
   de manos a media noche, hace falta un corte que parta el conteo.
2. **Exportación a PDF nativa.** Hoy el reporte se guarda en PDF desde el
   diálogo de impresión del navegador, con una hoja de estilos pensada para
   papel. Un PDF generado en el servidor solo hace falta si se va a enviar por
   correo automáticamente.
3. **Destino de los respaldos.** Ya están construidos y verificados, pero por
   defecto van a una carpeta del mismo disco. Eso protege contra un borrado
   accidental, no contra un disco dañado. Ver [RESPALDOS.md](RESPALDOS.md).
