# Respaldos y restauración

La base de datos es un archivo. Si ese archivo se pierde, el negocio pierde
toda su historia de abonos, cierres y arqueos, y no hay forma de reconstruirla
desde Soft Restaurant, que nunca supo cuánto entregó cada repartidor en caja.

---

## 1. Lo primero que hay que decidir: dónde

Por defecto las copias van a `respaldos/` dentro del proyecto. **Eso sirve
contra un borrado accidental, no contra un disco dañado.** Si el disco muere,
se lleva la base y las copias juntas.

Cambie el destino a otra unidad en el archivo `.env`:

```
RESPALDO_DIRECTORIO="D:/respaldos-caja"
```

o a una carpeta compartida en la red:

```
RESPALDO_DIRECTORIO="//servidor/respaldos/caja"
```

Lo ideal son dos destinos: uno local para restaurar rápido y otro fuera del
local. Un incendio o un robo del equipo se lleva cualquier cosa que esté en el
mismo mostrador.

---

## 2. Dos modos, según el motor

| Motor | Qué hace | Archivo |
|---|---|---|
| SQLite | Copia binaria con `VACUUM INTO` | `.db` |
| PostgreSQL | Volcado lógico de todas las tablas | `.json` |

El mismo comando sirve para los dos y elige solo. El volcado lógico existe
porque al mudar a un proveedor la aplicación deja de controlar los respaldos, y
el plan gratuito de Supabase no incluye copias automáticas. Quedarse sin
ninguna y no enterarse es justo lo que este documento trata de evitar.

El volcado no reproduce índices ni permisos, solo los datos. Es lo que no se
puede reconstruir: el esquema sale del repositorio con `prisma migrate`.

---

## 3. Por qué no se copia el archivo y ya

Copiar `dev.db` con el sistema en marcha puede producir una copia rota. Si la
copia empieza a la mitad de una transacción, el archivo resultante mezcla
páginas de dos estados distintos. Además SQLite guarda los cambios recientes en
archivos laterales que una copia ingenua deja fuera.

El respaldo usa `VACUUM INTO`, que le pide a SQLite escribir una base nueva y
consistente con el estado actual, sin bloquear la caja. Una copia de la base
completa tarda menos de un segundo.

**Un respaldo que nadie verificó no es un respaldo.** Después de crear cada
copia se abre, se le corre `integrity_check` y se cuentan sus filas contra las
del original. Si algo no cuadra, la copia se descarta y el comando falla.

Junto a cada copia queda un archivo `.json` con su tamaño, su SHA-256 y el
conteo de filas por tabla, para poder comprobar meses después que el archivo es
el que dice ser.

---

## 4. Uso diario

```bash
npm run db:respaldar
```

Otras opciones:

| Comando | Para qué |
|---|---|
| `npm run db:respaldar -- --listar` | Ver las copias existentes |
| `npm run db:respaldar -- --etiqueta cierre-de-mes` | Copia con nombre reconocible |
| `npm run db:respaldar -- --verificar` | Revisar la copia más reciente |
| `npm run db:restaurar -- --listar` | Ver de qué se puede restaurar |

### Retención

Se conservan 30 días de copias, pero nunca se baja de 10 copias aunque estén
vencidas. Si la caja estuvo apagada un mes, la regla por antigüedad sola
borraría el último respaldo que queda. Ambos números se ajustan en `.env`.

---

## 5. Tarea programada en Windows

Abra una consola **como administrador** en la carpeta del proyecto y ejecute:

```bash
schtasks /create /tn "Respaldo Control Express" /tr "\"%CD%\scripts\respaldo-diario.cmd\"" /sc daily /st 04:00 /rl highest
```

Corre todos los días a las 4 de la mañana, cuando la caja ya cerró. Si el
respaldo falla, el comando devuelve un código de error y la tarea aparece
fallida en el Programador de tareas, en vez de quedar en verde sin haber
copiado nada.

Para comprobar cuándo corrió por última vez:

```bash
schtasks /query /tn "Respaldo Control Express" /v /fo list
```

---

## 6. El dashboard avisa

Si el último respaldo tiene más de 36 horas, o si no hay ninguno, aparece un
aviso ámbar en el encabezado del dashboard.

Esto existe porque **un respaldo que dejó de correr no da ninguna señal por sí
mismo**. La tarea programada se rompe cuando alguien mueve la carpeta, cambia
la contraseña de Windows o llena el disco de destino, y el negocio se entera el
día que necesita restaurar. Para entonces ya perdió meses.

---

## 7. Restaurar

**Detenga la aplicación antes de restaurar.** Si el servidor sigue corriendo,
tiene la base abierta y va a escribir encima de lo que se acaba de restaurar.

```bash
npm run db:restaurar -- --listar
npm run db:restaurar -- --archivo caja-2026-09-10_040000.db --confirmar
```

Qué hace el comando, en orden:

1. Abre la copia y le corre `integrity_check`. El peor momento para descubrir
   que el archivo está corrupto es después de pisar la base viva.
2. Guarda un respaldo del estado actual, etiquetado `previo-restauracion`. Si
   alguien restaura el archivo equivocado, lo de hoy no se pierde.
3. Reemplaza la base y borra los archivos laterales de SQLite, que
   corresponden a la base anterior y no a la restaurada.

Después de restaurar, compruebe la base antes de abrir la caja:

```bash
npm run test:esquema
```

---

## 8. Probar que todo esto funciona

```bash
npm run test:respaldo
```

Escribe datos en una base aparte, respalda, borra los datos, restaura y
comprueba que volvieron los mismos. También corrompe una copia a propósito para
confirmar que la verificación la rechaza.

Vale la pena correr una restauración de verdad, sobre el equipo de la caja, al
menos una vez. Un procedimiento de restauración que nunca se ejecutó es una
suposición, no un plan.

---

## 9. Nota sobre PostgreSQL

El volcado lógico no sustituye a los respaldos del proveedor, los complementa.
Revise en el panel de Supabase qué plan tiene y cada cuánto toma copias. El
volcado de este repositorio es su red de seguridad propia, la que no depende
de que el proveedor siga existiendo.
