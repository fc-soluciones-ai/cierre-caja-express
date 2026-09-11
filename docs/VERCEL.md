# Despliegue en Vercel

El proyecto está conectado al repositorio de GitHub. Cada vez que suba algo a
la rama `main`, Vercel compila y publica solo.

**https://cierre-caja-express.vercel.app**

---

## 1. Qué es esta copia y qué no es

Es la copia de **consulta**: dashboard, historial, reportes, gestión de
repartidores. Sirve para ver cómo va la caja desde otra oficina.

**No imprime tiquetes.** La impresora térmica vive en la red de la pizzería y
un servidor en internet no la alcanza. Por eso `IMPRESORA_MODO` está en `NONE`
en la nube, aunque en el local esté en `NETWORK`. Si se copiara ahí la IP de la
impresora, cada cierre esperaría varios segundos a una máquina inalcanzable y
no saldría ningún papel.

**La caja que emite comprobantes sigue siendo la computadora del local.** Las
dos instancias trabajan contra la misma base en Supabase, así que ven lo mismo.

---

## 2. Las variables de entorno

```bash
npm run vercel:variables -- --aplicar
```

Lee el `.env` local y sube lo que la aplicación necesita. Los valores van por
la entrada estándar, nunca como argumento del comando: un argumento queda en el
historial del shell y ahí está la contraseña de la base.

Hay que volver a correrlo **cada vez que cambie la contraseña de Supabase**, y
después volver a desplegar: los despliegues ya hechos conservan los valores que
tenían.

### Si dice que no encuentra la sesión

El CLI de Vercel guarda las credenciales en una ruta que depende de la consola
desde la que se corra. Puede pasar que Git Bash vea la sesión y PowerShell no,
aunque sea el mismo usuario y la misma máquina.

La solución es iniciar sesión desde la consola donde va a trabajar:

```bash
vercel login
```

El comando comprueba la sesión antes de tocar nada, así que un fallo así no
deja el proyecto con unas variables nuevas y otras viejas.

| Variable | De dónde sale |
|---|---|
| `DATABASE_URL` | Del `.env`, conexión agrupada |
| `DIRECT_URL` | Del `.env`, conexión directa |
| `MONEDA` | Fijo, `CRC` |
| `HORA_CORTE_DIA_OPERATIVO` | Fijo, `06:00` |
| `NOMBRE_NEGOCIO` | Fijo, encabezado del tiquete |
| `IMPRESORA_MODO` | Forzado a `NONE` |

---

## 3. Protección de acceso

**Vercel Authentication está encendido, y así se queda.** Quien abra la
dirección sin estar dentro del equipo de Vercel recibe una pantalla de inicio
de sesión y no llega ni a la pantalla del PIN.

Es deliberado. La aplicación maneja el efectivo de un negocio y se protege con
cuatro dígitos; esta es una segunda puerta que no cuesta nada mantener. Quien
necesite entrar a la copia de la nube debe tener cuenta en el equipo de Vercel.

La caja del local no pasa por aquí: corre en la computadora del mostrador y
solo pide el PIN.

### Si algún día hay que apagarlo

Haría falta solo si cajeros sin cuenta de Vercel tuvieran que entrar desde sus
teléfonos. En ese caso, **antes** de apagarlo: subir el PIN a seis dígitos, y
revisar que el bloqueo por intentos siga en su sitio.

Se apaga en **Project Settings → Deployment Protection → Vercel Authentication
→ Disabled**.

---

## 4. Desplegar a mano

Normalmente no hace falta: basta con subir a `main`.

```bash
npx vercel --prod
```

Para ver el estado:

```bash
npx vercel ls
```

---

## 5. Migraciones de base de datos

El despliegue **no** aplica migraciones. El comando de compilación solo genera
el cliente de Prisma y construye la aplicación.

Si cambia el esquema, la migración se aplica desde su equipo antes de subir:

```bash
npx prisma migrate deploy
```

Es a propósito. Una migración que corre sola en cada despliegue es cómoda
hasta la noche en que falla a medias y deja la base del negocio en un estado
que nadie eligió.
