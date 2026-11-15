# Gastos Pro — diseño (v2: arquitectura nueva)

Fecha: 14-11-2026 · Repo: `cristobalmunoz198/Gastos` · Planilla base: Google Sheet nativa "Presupuesto 2026." 

## Para qué

Cristóbal quiere manejar todas sus finanzas personales **solo desde la app del iPhone**: registrar, editar, borrar, presupuestar y configurar. Así sabe en todo momento cuánto lleva gastado, cuánto le queda y en qué se le va la plata. La planilla sigue existiendo como respaldo e historial. Cuando la abra, tiene que **verse y entenderse igual que hoy**: un Resumen con Presupuesto | Real por mes y una pestaña por mes con la matriz categoría × día.

## Decisión de arquitectura

Se separan los **datos**, que son tablas simples que escribe la app, de las **vistas**, que son las pestañas que Cristóbal ya conoce. Las vistas se calculan a partir de los datos.

Ya no se escribe a mano en las pestañas de mes; todo se hace desde la app. Si alguna vez hay que corregir algo en la planilla, se edita la fila en `Movimientos`.

### Opciones consideradas
- **A) Datos + vistas (elegida).** Editar, borrar, renombrar y agregar categorías se vuelve trivial, y deja lista la conexión con las notificaciones del banco.
- B) Mantener la matriz como base de datos y sumar funciones a la app (diseño v1). Toca menos la planilla, pero editar, renombrar y la integración con el banco quedan frágiles. Se descarta porque Cristóbal trabajará solo desde la app.

## Estructura de la planilla

**Datos** (los escribe la app; se pueden leer y corregir a mano):
| Pestaña | Columnas |
|---|---|
| `Movimientos` | id · fecha · categoría_id · monto · nota · origen (`app`, `migración`, más adelante `banco`) · creado · editado |
| `Categorías` | id · sección · nombre · tipo (`ingreso`, `ahorro`, `fijo`, `variable`, `deuda`) · orden · activa |
| `Presupuesto` | año · mes · categoría_id · monto |
| `Config` | colchón (250.000) · año visible · token · otros ajustes |

**Vistas** (las arma el script y se ven como hoy):
- `Resumen`: misma forma que la actual. Bloques Ingresos, Inversiones y Ahorro, Gastos Fijos, Gastos Variables (con sus subsecciones) y Deudas. Por cada mes, columnas Presupuesto | Real, más Total Año. Al final, Flujo, Total Gasto Fijo y Variable, Total a depositar (`= gastos presupuestados + colchón`), Total a Ahorrar, Gastado y Disponible. Arriba hay un selector de año.
- `Enero` … `Diciembre`: matriz categoría × día 1–31 + TOTAL del año visible, con las secciones en el mismo orden.
- Cuando cambian las categorías, el script redibuja las vistas. Las celdas tienen que reflejar los cambios hechos a mano en `Movimientos`, sea con fórmulas o con un recálculo automático al editar. Esa elección queda a criterio de quien construye, según el rendimiento.

**Un solo archivo para todos los años.** Las vistas muestran el año elegido en `Resumen` y se puede volver a 2026 cuando se quiera.

## Definiciones (las mismas de hoy)
- **Gastado** = suma de lo real en categorías `fijo`, `variable` y `deuda`.
- **Total a depositar** = suma del presupuesto de esas categorías + colchón.
- **Disponible** = Total a depositar − Gastado. **Por día** = Disponible ÷ días que quedan del mes, incluido hoy.
- Ingresos y Ahorro se registran y se muestran, pero no cuentan como gasto.

## App (GitHub Pages + Apps Script, con el mismo patrón de URL y token)
1. **Inicio:** arriba el anillo (disponible, % usado, cuánto se puede gastar por día, días que quedan). Debajo, un sobre por sección: rojo si se pasó, verde si va dentro, gris si no tiene presupuesto. Al tocar un sobre se ven sus categorías y movimientos. Hay un selector de mes y año.
2. **Registrar:** el mismo flujo de hoy (monto → tipo → categoría → fecha → nota). Al guardar, la app dice cuánto queda.
3. **Movimientos:** lista por mes con búsqueda. Al tocar uno se puede editar (monto, categoría, fecha, nota) o borrar.
4. **Presupuesto:** los topes del mes por categoría, el colchón y el sueldo esperado, con un botón "Copiar del mes anterior".
5. **Categorías:** crear, renombrar, mover de sección, ordenar y desactivar. Una categoría desactivada desaparece de Registrar, pero su historial se conserva.
6. **Historial:** Gastado vs Total a depositar mes a mes, también de años anteriores.

## Automatizaciones
- **Año nuevo:** un disparador diario. A más tardar el **21 de diciembre** crea el presupuesto del año siguiente: los 12 meses con el presupuesto de diciembre como base, que se ajusta mes a mes. Desde el 1 de enero, la app y las vistas pasan solas al año nuevo.

## Migración desde 2026
- El script lee las 12 pestañas actuales y desarma cada celda en movimientos: `=6000+8330+1720` del día 7 pasa a ser 3 movimientos del 07-mm-2026. Las notas de celda se pasan a la nota del movimiento.
- Crea las `Categorías` desde la columna A. Si el nombre de una fila cambió entre meses (por ejemplo, ChatGPT → Claude en la misma fila), queda una sola categoría con el nombre más reciente.
- Migra el presupuesto de cada mes desde la columna Presupuesto del Resumen.
- **Verificación obligatoria:** los totales por categoría y mes de la vista nueva tienen que cuadrar peso a peso con el Resumen actual. El script muestra cualquier diferencia antes de reemplazar algo.
- Las pestañas originales se guardan como copia de respaldo antes de reemplazarlas.

## Fuera de alcance por ahora
- Gastos fijos automáticos (para después).
- Avisos (descartados).
- Notificaciones del banco (más adelante; queda preparado con `origen`).

## Lo que no debe pasar
- Perder o alterar el historial 2026 en la migración.
- Que la planilla deje de entenderse a simple vista.
- Que la app muestre cifras distintas a las de la planilla.

## Restricciones
- Cuenta personal de Google. Apps Script web app con token. Frontend estático en GitHub Pages.
- La app tiene que responder rápido en el celular: lee las tablas de datos, no las vistas.

## Lo que queda a criterio de quien construye
- Fórmulas o recálculo por script en las vistas, según el rendimiento.
- Detalles visuales de las pantallas, mensajes y formato de los IDs.
