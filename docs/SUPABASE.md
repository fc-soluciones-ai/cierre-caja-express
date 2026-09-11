# Pasar a PostgreSQL en Supabase

Guía para mover la base de un archivo SQLite local a PostgreSQL hospedado.

**Antes de empezar, lea esto:** mover la base a la nube no mueve la impresora.
El tiquete sale por una impresora que vive en la red de la pizzería, y un
servidor en internet no puede alcanzarla. La arquitectura que funciona es la
caja corriendo en la computadora del local, contra la base en Supabase, y una
copia en la nube solo para consultar reportes.

---

## 1. Qué copiar de Supabase

En el panel del proyecto, **Project Settings → Database → Connection string**.
Supabase le da varias y no son intercambiables:

| Cadena | Para qué | Puerto |
|---|---|---|
| **Transaction pooler** | Que la aplicación consulte | 6543 |
| **Direct connection** | Que Prisma aplique migraciones | 5432 |

Hacen falta las dos. El pooler reparte conexiones entre muchas peticiones, que
es lo que necesita una aplicación web; pero las migraciones cambian la
estructura de las tablas y eso exige una conexión directa.

**No pegue esas cadenas en un chat ni las suba al repositorio.** Llevan la
contraseña de su base de datos. Van en el archivo `.env`, que el `.gitignore`
ya deja fuera.

---

## 2. Ponerlas en el archivo de entorno

Abra `.env` y reemplace la línea de `DATABASE_URL`:

```
DATABASE_URL="postgresql://postgres.xxxx:CONTRASENA@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.xxxx:CONTRASENA@aws-0-region.pooler.supabase.com:5432/postgres"
```

El `?pgbouncer=true` del final de la primera no es opcional. Sin él, Prisma
prepara sentencias que el pooler no sabe manejar y las consultas fallan de
forma intermitente, que es la peor manera de fallar.

---

## 3. Cambiar el motor en el esquema

En `prisma/schema.prisma`, el bloque `datasource` pasa a:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

Nada más del esquema cambia. Se diseñó para esto desde el principio: los enums
son columnas de texto validadas en la aplicación, el dinero son enteros, y no
se usa ninguna función exclusiva de SQLite.

---

## 4. Mudar los datos que ya existen

La base local tiene repartidores reales y el PIN que usted ya cambio. Si solo
se crean las tablas nuevas, eso se pierde.

Antes de cambiar el motor, con la configuracion todavia en SQLite:

```bash
npm run datos:exportar
```

Despues de crear las tablas en PostgreSQL:

```bash
npm run datos:importar -- --aplicar
```

Los PIN viajan como hash, asi que nadie necesita conocerlos ni cambiarlos.
Las sesiones abiertas no se trasladan: son credenciales vivas y no cuesta
nada volver a entrar.

---

## 5. Crear las tablas

```bash
npx prisma migrate dev --name inicial
npm run db:seed
```

---

## 6. Comprobar antes de confiar

```bash
npm test
```

Las comprobaciones corren contra la base que diga `DATABASE_URL`. Si pasan las
139 contra PostgreSQL, la migración quedó bien.

---

## 7. Lo que cambia en la operación

**Los respaldos ya no son los de este repositorio.** El comando `db:respaldar`
usa `VACUUM INTO`, que es de SQLite. Con PostgreSQL, Supabase hace respaldos
automáticos en su plan, y para una copia propia se usa `pg_dump`. Hay que
reescribir el procedimiento de `docs/RESPALDOS.md`.

**La caja deja de funcionar sin internet.** Hoy, si se cae la conexión, el
sistema sigue recibiendo abonos porque la base está en el mismo equipo. Contra
Supabase, sin internet no hay caja. Para un negocio que cierra a la una de la
mañana esto no es un detalle menor: conviene tener claro qué se hace esa noche
que el proveedor falle.

**Un límite que hoy no molesta.** Los montos se guardan como enteros de 32
bits, que topan en ₡21.400.000 por registro. Ningún movimiento ni total diario
de una pizzería se acerca. Si alguna vez el sistema se usara en un negocio con
otro volumen, esas columnas tendrían que pasar a 64 bits.

---

## 8. Una trampa del agrupador que costo caro

Las pruebas destructivas corren contra un esquema aparte llamado `pruebas`.
La primera version las hacia pasar por el agrupador en modo transaccion, el
puerto 6543, y eso resulto peligroso.

Ese puerto reparte una misma conexion del servidor entre muchos clientes. El
`SET search_path` que Prisma emite para apuntar al esquema de pruebas se queda
pegado en esa conexion, y lo hereda quien la reciba despues. Incluida la
aplicacion en produccion.

Se vio en vivo: despues de correr las pruebas, TODAS las conexiones nuevas
veian el esquema de pruebas. El dashboard reportaba cero repartidores y un
abono nuevo se habria escrito en las tablas equivocadas. Los datos nunca se
perdieron, pero la aplicacion estaba mirando al lugar equivocado.

Dos cambios lo cierran:

1. La direccion de la aplicacion fija `schema=public` de forma explicita, asi
   Prisma lo establece en cada conexion y no hereda nada.
2. Las pruebas van por el puerto 5432, en modo sesion, donde cada conexion es
   propia y lo que se configure ahi no sale de ella.

La leccion general: en un agrupador en modo transaccion, cualquier `SET` que
no se limpie es un efecto secundario que viaja a otros clientes.

---

## 9. Una trampa peor, que si borro datos

Corregir la fuga del agrupador destapo un problema de fondo que esa misma fuga
venia tapando por accidente.

El envoltorio de pruebas apuntaba a la base de pruebas escribiendo
`process.env.DATABASE_URL` antes de importar el script. Eso no funciona. El
cliente de Prisma resuelve `env("DATABASE_URL")` releyendo el archivo `.env`
por su cuenta, y descarta lo que le haya dejado quien lo importa.

Mientras el `search_path` estaba contaminado, las pruebas terminaban en el
esquema `pruebas` de todos modos, por la razon equivocada. Al fijar
`schema=public` en la direccion de la aplicacion, las pruebas pasaron a correr
contra produccion y su rutina de limpieza borro todas las tablas del negocio.
Se restauro del respaldo del dia anterior.

Dos barreras lo cierran, y son independientes a proposito:

1. **La direccion de pruebas viaja en `DATABASE_URL_PRUEBAS`**, una variable
   que Prisma no conoce y que `.env` no define. `src/lib/db/prisma.ts` se la
   entrega al constructor en `datasources`, y lo explicito gana sobre lo que
   Prisma vuelva a leer.
2. **Cada script destructivo llama a `exigirBaseDePruebas()`** y se niega a
   correr si no ve el esquema `pruebas`. Aunque el envoltorio falle, no borra.

La leccion general: una biblioteca que lee su configuracion sola no obedece al
entorno que uno le prepare. Hay que pasarle el valor a la cara, y no dar por
sentado que lo tomo.

### Probar sin miedo

`npm run demo` levanta la aplicacion en el puerto 3100 contra el esquema de
pruebas, y `npm run demo:flota` le pone una flota de ejemplo. Sirve para
enseñar el sistema o entrenar a alguien sin tocar la contabilidad.
