# Cierre Caja Express

Gestión de efectivo para repartidores de pizzería: recepción de abonos
parciales durante el turno, cierre de turno conciliado contra los reportes de
venta por mesero de Soft Restaurant (National Soft), arqueo de caja y tiquetes
térmicos de 80 mm.

Pensado para un monitor táctil de mostrador, operado de noche, con el dedo.

---

## Para qué sirve

Un repartidor sale con pedidos y vuelve con efectivo. Si acumula toda la noche,
anda con demasiado dinero en la calle. El sistema recibe entregas parciales a
lo largo del turno, imprime un comprobante de cada una, y al cierre contrasta
lo recibido contra lo que el punto de venta dice que ese repartidor vendió en
efectivo.

```
diferencia = (abonos parciales + efectivo entregado) − efectivo esperado
```

Positiva es sobrante, negativa es faltante.

---

## Stack

| Pieza | Elección |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| Interfaz | Tailwind CSS, objetivos táctiles de 64 px |
| Base de datos | SQLite con Prisma (portable a PostgreSQL) |
| Excel | SheetJS, lee el BIFF antiguo de `.xls` que exporta Soft Restaurant |
| Impresión | ESC/POS por socket TCP al puerto 9100 |

---

## Puesta en marcha

```bash
npm install
cp .env.example .env
npm run db:push
npm run db:seed
npm run dev
```

Abra `http://localhost:3000`. El seed genera un PIN aleatorio para el
administrador y lo imprime una sola vez: anótelo. Para cambiarlo después:

```bash
npm run pin
```

El PIN se teclea en la terminal sin mostrarse y nunca se pasa como argumento
del comando, porque los argumentos quedan en el historial del shell.

Para servir a una tablet en la misma red, `npm run dev:red`.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm test` | Las 139 comprobaciones automáticas |
| `npm run demo -- --aplicar` | Prepara una noche de práctica para entrenar |
| `npm run db:respaldar` | Copia verificada de la base |
| `npm run db:restaurar -- --listar` | Ver y restaurar respaldos |
| `npm run db:repartidores` | Sincronizar el padrón de repartidores |
| `npm run print:probar` | Ver las cuatro plantillas de tiquete sin hardware |
| `npm run ejemplos` | Generar reportes de Excel de prueba |
| `npm run pin` | Cambiar el PIN de un cajero |
| `npm run datos:exportar` | Sacar los datos para mudar de motor |

---

## Decisiones que conviene conocer antes de tocar el código

**El dinero es un entero en céntimos, nunca un decimal.** El factor sale del
exponente ISO 4217 de la moneda, no de un `× 100` reflejo. Un arqueo con
aritmética de punto flotante acumula errores que después nadie puede explicar.

**No se guardan saldos acumulados.** El saldo de un repartidor y el efectivo en
caja son sumas derivadas. Un contador denormalizado sería una segunda fuente de
verdad que se desincroniza en cuanto se anula un abono.

**Los registros de dinero no se editan ni se borran.** Una corrección se asienta
como un movimiento de reverso enlazado al original. La bitácora es append-only.

**"Activo" y "en turno" son cosas distintas.** Activo significa que el
repartidor trabaja en el negocio; en turno, que trabaja esta noche. El
dashboard muestra solo lo segundo.

La documentación completa está en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)
el procedimiento de respaldo en [docs/RESPALDOS.md](docs/RESPALDOS.md), el
paso a PostgreSQL en [docs/SUPABASE.md](docs/SUPABASE.md) y el despliegue en
[docs/VERCEL.md](docs/VERCEL.md).

---

## Qué no está en el repositorio

El archivo `.env`, las bases de datos, los respaldos y las fotos de los
repartidores quedan fuera por el `.gitignore`. Son datos del negocio, no código.
