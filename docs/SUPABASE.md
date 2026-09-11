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

## 4. Crear las tablas

```bash
npx prisma migrate dev --name inicial
npm run db:seed
```

---

## 5. Comprobar antes de confiar

```bash
npm test
```

Las comprobaciones corren contra la base que diga `DATABASE_URL`. Si pasan las
139 contra PostgreSQL, la migración quedó bien.

---

## 6. Lo que cambia en la operación

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
