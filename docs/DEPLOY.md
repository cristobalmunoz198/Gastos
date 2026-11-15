# Gastos Pro — puesta en marcha

Tiempo estimado: 20 minutos. Hazlo con el computador.

> **Antes de partir:** desde este momento deja de registrar gastos con la app antigua (escribe en el .xlsx). Si anotaste algo hoy en el .xlsx, cópialo primero a la Google Sheet nativa "Presupuesto 2026." en la celda del día.

## 1. Crear el script en la planilla

1. Abre la Google Sheet nativa **Presupuesto 2026.** (con tu cuenta personal).
2. Menú **Extensiones → Apps Script**. Se abre un proyecto nuevo, vinculado a esta planilla.
3. Borra el contenido de `Código.gs`.
4. Crea 7 archivos de script (botón **＋ → Secuencia de comandos**), con estos nombres, y pega en cada uno el contenido del archivo con el mismo nombre de la carpeta `apps-script/` del repo:
   `Config` · `Datos` · `Calculos` · `Vistas` · `Migracion` · `AnioNuevo` · `Api`
   (puedes pegar `Config` en el `Código.gs` existente y renombrarlo).
5. Guarda (💾).

## 2. Guardar la clave en privado

1. En Apps Script: **⚙️ Configuración del proyecto**. Revisa que la **Zona horaria** sea *(GMT-03:00) Santiago*.
   Luego, más abajo: **Propiedades del script → Agregar propiedad**.
2. Agrega:
   - `TOKEN` = la clave que usarás en el iPhone (inventa una nueva; no la escribas en ningún archivo del repo).
   - `SHEET_ID` = el ID de tu planilla (lo que va entre `/d/` y `/edit` en su link)
3. Guarda.

## 3. Probar la migración (no cambia nada)

1. Vuelve al editor, abre `Migracion.gs`.
2. Arriba, en el selector de funciones, elige **`simularMigracion`** y presiona **▶ Ejecutar**.
3. La primera vez Google pide permisos: **Revisar permisos → tu cuenta → Avanzado → Ir a (proyecto) → Permitir**.
4. Mira el **Registro de ejecución**. Debe decir algo como:
   `Migración (simulación) {"categorias":65,"movimientos":853,"presupuestos":174,"diferencias":0}`
   - Si `diferencias` no es 0, el registro dice en qué mes y categoría. **No sigas**: avísame qué dice.

## 4. Migrar e instalar

1. Elige la función **`migrar`** → ▶ Ejecutar. Hace una copia de respaldo ("Presupuesto 2026 — respaldo antes de migrar", en tu Drive) y después reescribe la planilla con la estructura nueva.
2. Elige **`instalar`** → ▶ Ejecutar. Crea los disparadores (año nuevo automático y redibujar al editar a mano).
3. Revisa la planilla: verás Resumen (con "Año | 2026" arriba), Enero…Diciembre igual que antes, y al final Movimientos, Categorías y Presupuesto.

## 5. Publicar como app web

1. **Implementar → Nueva implementación → ⚙️ Tipo: App web**.
2. Descripción: `Gastos Pro`. **Ejecutar como: Yo**. **Quién tiene acceso: Cualquier usuario**.
3. **Implementar** y copia la URL que termina en **/exec**.

## 6. Subir la app a GitHub

En tu repo `Gastos`, sube (reemplazando) `index.html` y agrega `app.css` y `app.js`. GitHub Pages se actualiza en 1–2 minutos.

## 7. Conectar el iPhone

1. Abre la app desde el ícono de la pantalla de inicio.
2. Si te muestra la app antigua, ciérrala del todo y ábrela de nuevo.
3. Si pide **Conectar**, pega la URL /exec nueva y la clave del paso 2. Si entra directo con la conexión vieja, ve a **Ajustes → Conexión** y cámbiala ahí.

## Cuando cambies el código más adelante

Después de editar un `.gs`: **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión → Implementar**. Así la URL /exec no cambia.

## Si algo sale mal

- La copia de respaldo está en tu Drive. Para volver atrás: abre la copia y sigue usándola como antes.
- Para repetir la migración desde cero: abre la copia de respaldo, crea ahí el script (pasos 1–4) con `SHEET_ID` = el ID de la copia, y migra esa.

## Actualización: versión rápida (14-11-2026)

1. **Apps Script:** reemplaza el contenido de **`Api`** y **`Datos`** por los archivos nuevos (los otros 5 no cambian). Guarda.
2. **Implementar → Gestionar implementaciones → ✏️ (lápiz) → Versión: Nueva versión → Implementar.** La URL /exec sigue siendo la misma.
3. **GitHub:** sube `index.html`, `app.css`, `app.js` y el archivo nuevo **`calculos.js`** (Add file → Upload files → Commit changes).
4. **iPhone:** cierra la app del todo y ábrela de nuevo. No hay que reconectar.

Qué cambia: la app guarda los datos del año en el teléfono y calcula todo ahí (cambiar de pantalla o de mes es instantáneo). Al guardar, el cambio se ve al tiro y se envía a Google por detrás; si no hay señal queda "pendiente" y se envía solo después. La planilla (Resumen y meses) se actualiza alrededor de 1 minuto después de cada cambio; la pestaña Movimientos, al instante.

Si cambias `Calculos.gs`, copia el mismo contenido a `calculos.js` (las pruebas avisan si quedan distintos).

## Actualización: tendencias, metas de ahorro y modo sin internet (14-11-2026)

1. **Apps Script:** reemplaza **`Config`**, **`Datos`**, **`Calculos`** y **`Api`** por los archivos nuevos. Guarda.
2. **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión → Implementar.**
3. **GitHub:** sube `index.html`, `app.css`, `app.js`, `calculos.js` y el archivo nuevo **`sw.js`**.
4. **iPhone:** cierra y abre la app **dos veces** (la primera descarga la versión nueva y la deja guardada en el teléfono; la segunda ya la usa).

La pestaña **Metas** se crea sola en la planilla cuando guardas tu primera meta.

Nota sobre actualizaciones futuras: como la app queda guardada en el teléfono, cada vez que subas cambios a GitHub la app los muestra a partir de la **segunda** vez que la abras.
