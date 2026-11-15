# Gastos Pro — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rehacer la app de gastos para que todo (registrar, editar, borrar, presupuestar, configurar) se haga desde el iPhone, con datos en tablas simples y la planilla mostrando Resumen + Enero…Diciembre igual que hoy.

**Architecture:** Apps Script (web app con token) sobre una Google Sheet nativa con 4 pestañas de datos (`Movimientos`, `Categorías`, `Presupuesto`, `Config`) y vistas (`Resumen`, `Enero`…`Diciembre`) que el script reescribe como valores después de cada cambio. Frontend estático en GitHub Pages (`index.html` + `app.css` + `app.js`) que habla con el script por `fetch`. La lógica de cálculo vive en funciones puras para poder probarla en Node.

**Tech Stack:** Google Apps Script (V8), Google Sheets, HTML/CSS/JS sin frameworks, Node 22 (`node:test`) con un mock en memoria de SpreadsheetApp, Playwright (Python) para pruebas de humo de la UI.

**Spec:** `docs/superpowers/specs/2026-11-14-gastos-pro-design.md` (v2)

## Global Constraints

- Planilla: Google Sheet nativa "Presupuesto 2026." (ID en Propiedades del script, no en el repo), cuenta personal de Google.
- **El repo es público:** nunca commitear token, ID de planilla ni datos financieros reales. El token y el ID viven en `PropertiesService.getScriptProperties()` (`TOKEN`, `SHEET_ID`); los tests usan fixtures sintéticas. La verificación contra datos reales usa un archivo local fuera del repo (`/home/claude/work/wb.json`, en `.gitignore` si se copia).
- Pestañas de datos con encabezados exactos:
  - `Movimientos`: `id | fecha | categoria_id | monto | nota | origen | creado | editado` (`fecha` = Date sin hora; `origen` ∈ `app`, `migracion`, `banco`)
  - `Categorías`: `id | seccion | nombre | tipo | orden | activa` (`tipo` ∈ `ingreso`, `ahorro`, `fijo`, `variable`, `deuda`)
  - `Presupuesto`: `anio | mes | categoria_id | monto` (`mes` 1–12; `categoria_id = "_colchon"` guarda el colchón del mes)
  - `Config`: `clave | valor` (claves: `colchon_default` = 250000, `anio_visible`)
- Definiciones: **Gastado** = Σ real de tipos `fijo`+`variable`+`deuda`. **Total a depositar** = Σ presupuesto de esos tipos + colchón del mes. **Disponible** = Total a depositar − Gastado. **Por día** = `max(0, floor(Disponible / díasRestantes))`, díasRestantes incluye hoy (0 para meses pasados, días del mes para meses futuros).
- Zona horaria `America/Santiago`. Montos en CLP enteros, formato `$1.234.567` (`es-CL`).
- Orden de bloques en `Resumen` y meses: Ingresos · Inversiones y Ahorro · Gastos Fijos · Gastos Variables (cabecera, luego cada sección variable: Comida, Transporte, Cuidado Personal, Salud, Ocio y Aprendizaje, Otros) · Deudas · totales (Flujo, Total Gasto Fijo y Variable, Total a depositar, Total a Ahorrar, Gastado, Disponible).
- Año nuevo: creado a más tardar el **21 de diciembre**.
- Fuera de alcance: gastos fijos automáticos, avisos, notificaciones del banco (solo el valor `origen=banco` queda reservado).
- Textos de UI en español de Chile, frases cortas.

## Review Focus

1. **Celdas antiguas con fórmulas no triviales** (`=15000*4`, `=SUM(...)`, montos negativos como `-20000` en Ahorro Líquido): la migración debe crear un único movimiento con el valor calculado, conservando el signo; nunca perder el monto. → test en Task 3.
2. **Editar un movimiento cambiándolo de mes o de año:** ambos meses deben quedar recalculados en panel y vistas. → test en Task 2 (panel) y Task 5 (API re-render de ambos meses).
3. **Categoría desactivada con historial:** no aparece en Registrar, pero sus montos siguen sumando en panel, historial y vistas. → test en Task 2.
4. **Doble toque en Guardar / pérdida de red:** el frontend deshabilita el botón mientras espera y no reenvía; el backend usa `LockService`. → test UI en Task 7.
5. **Mes sin presupuesto o colchón ausente:** `depositar` usa `colchon_default`; si no hay ningún presupuesto de gasto, la app muestra "Sin presupuesto este mes" en vez de un disponible negativo engañoso. → test en Task 2 y UI en Task 7.

---

## Estructura de archivos

```
apps-script/            (se copian al editor de Apps Script, un archivo .gs por archivo)
  Config.gs       getSS_, props, leer/escribir Config
  Datos.gs        tablas genéricas + CRUD de Movimientos/Categorías/Presupuesto
  Calculos.gs     funciones puras: panel, historial, matrices de vistas
  Vistas.gs       escribe Resumen y Enero…Diciembre como valores
  Migracion.gs    migrar2026(): matriz antigua → tablas, verificación, respaldo
  AnioNuevo.gs    revisarAnioNuevo_() diario + instalar()
  Api.gs          doGet/doPost, token, lock, ruteo de acciones
index.html, app.css, app.js       frontend
tests/
  gas-mock.js     mock en memoria de SpreadsheetApp/Utilities/Lock/Properties/DriveApp/ScriptApp
  load-gas.js     carga apps-script/*.gs en un contexto vm con el mock
  fixtures.js     planilla sintética pequeña (formato antiguo y tablas nuevas)
  *.test.js       node --test
  ui_smoke.py     Playwright con fetch stub
docs/DEPLOY.md    pasos para Cristóbal
```

---

### Task 1: Base de pruebas + Config.gs + Datos.gs

**Files:**
- Create: `tests/gas-mock.js`, `tests/load-gas.js`, `tests/fixtures.js`, `tests/datos.test.js`, `apps-script/Config.gs`, `apps-script/Datos.gs`, `package.json` (`"scripts": {"test": "node --test tests/"}`), `.gitignore` (`node_modules/`, `*.local.json`)

**Interfaces:**
- Produces:
  - `loadGas(store) -> ctx` (tests): ejecuta todos los `.gs` en un `vm` con globals mockeados; `store` = `{ [sheetName]: string[][] }`.
  - `getSS_() -> Spreadsheet` (abre `SHEET_ID` de Script Properties; si falta, `SpreadsheetApp.getActive()`).
  - `getConfig_(clave) -> any`, `setConfig_(clave, valor)`.
  - `asegurarTablas_()` crea las 4 pestañas de datos con encabezados exactos si faltan.
  - `leerTabla_(nombre) -> Object[]` (objetos por encabezado, ignora filas vacías), `agregarFila_(nombre, obj)`, `actualizarPorId_(nombre, id, cambios) -> Object|null`, `borrarPorId_(nombre, id) -> Object|null`.
  - `nuevoId_() -> string` (8 caracteres de `Utilities.getUuid()`).
  - `listarCategorias_() -> Categoria[]` ordenadas por `orden`; `guardarCategoria_(c) -> Categoria` (crea si no hay `id`).
  - `listarMovimientos_(anio, mes?) -> Movimiento[]`; `crearMovimiento_({fecha, categoria_id, monto, nota, origen}) -> Movimiento`; `editarMovimiento_(id, cambios) -> {antes, despues}`; `borrarMovimiento_(id) -> Movimiento`.
  - `leerPresupuesto_(anio, mes) -> {[categoria_id]: monto}`; `guardarPresupuesto_(anio, mes, mapa)` (reemplaza filas de ese mes).

- [ ] **Step 1: Escribir tests** en `tests/datos.test.js`: `asegurarTablas_` crea encabezados exactos de Global Constraints; crear → listar → editar → borrar un movimiento devuelve los valores esperados y `editado` se llena; `guardarPresupuesto_(2026, 11, {a: 1000, _colchon: 250000})` dos veces deja 2 filas, no 4; `listarCategorias_` respeta `orden`.
- [ ] **Step 2: Correr** `npm test` → FAIL (funciones no definidas).
- [ ] **Step 3: Implementar** `tests/gas-mock.js` (Range con getValues/setValues/getDisplayValues/getFormulas/getNote/clear, Sheet con appendRow/deleteRow/insertSheet/getLastRow/getLastColumn/hideSheet/clear, `Utilities.formatDate` respetando la zona, `PropertiesService`, `LockService` no-op, `DriveApp.getFileById().makeCopy()` que registra la copia) y luego `Config.gs`/`Datos.gs`. Las fechas se guardan como `Date` a medianoche local.
- [ ] **Step 4: Correr** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: tablas de datos y base de pruebas`.

### Task 2: Cálculos puros (panel e historial)

**Files:**
- Create: `apps-script/Calculos.gs`, `tests/calculos.test.js`

**Interfaces:**
- Consumes: estructuras `Categoria`, `Movimiento` de Task 1.
- Produces:
  - `calcularPanel_({categorias, movimientos, presupuesto, colchonDefault, anio, mes, hoy}) -> Panel` donde `Panel = {anio, mes, gastado, depositar, disponible, porDia, diasMes, diasRestantes, ingresos, ahorro, sinPresupuesto:boolean, sobres:[{seccion, tipo, real, pres, estado:'pasado'|'ok'|'sin', categorias:[{id,nombre,real,pres}]}]}`; `sobres` ordenados: `pasado` primero, luego `ok`, luego `sin`; dentro de cada grupo, mayor `real` primero. Solo secciones de tipo `fijo`/`variable`/`deuda` con `real>0 || pres>0`.
  - `calcularHistorial_({categorias, movimientos, presupuestosPorMes, colchonDefault, anio}) -> [{mes, gastado, depositar, disponible}]` (12 elementos).
  - `matrizMes_({categorias, movimientos, anio, mes}) -> {filas:[{categoria_id, dias:number[31], total}]}`.

- [ ] **Step 1: Tests** con fixture sintética (3 categorías variables, 1 fija, 1 ingreso, 1 deuda): totales correctos; `estado` rojo cuando `real>pres`; categoría `activa:false` sigue sumando (Review Focus 3); `hoy = 2026-11-14` → `diasRestantes = 17`, mes pasado → 0, futuro → 30; sin presupuesto de gasto → `sinPresupuesto:true` y `depositar = colchon` (Review Focus 5); colchón del mes en `presupuesto._colchon` gana sobre `colchonDefault`; movimiento movido de nov a dic cambia ambos paneles (Review Focus 2); `matrizMes_` suma dos movimientos del mismo día.
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar** las tres funciones; solo dependen de sus argumentos.
- [ ] **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** `feat: cálculo de panel, historial y matriz`.

### Task 3: Migración desde la planilla 2026

**Files:**
- Create: `apps-script/Migracion.gs`, `tests/migracion.test.js`; fixture antigua en `tests/fixtures.js` (Resumen + 2 meses en formato matriz, con fórmulas `=6000+8330`, `=15000*4`, `-20000`, una celda con nota `"07/11 12:30 · $8.330 · pan"`, y una fila renombrada entre meses)

**Interfaces:**
- Consumes: Task 1 (tablas), Task 2 (`matrizMes_` para verificar).
- Produces:
  - `parsearCelda_(formula, valor) -> number[]`: `"=6000+8330+1720"` → `[6000,8330,1720]`; `"=1000-200"` → `[1000,-200]`; cualquier otra fórmula → `[valor]`; número → `[valor]`; vacío/0 → `[]`.
  - `leerEstructuraAntigua_(sheet) -> [{fila, seccion, nombre}]` (misma regla que el script actual: ítem = fila con TOTAL no vacío).
  - `migrar2026(opciones={simular:false}) -> {categorias, movimientos, presupuestos, diferencias:[{mes, categoria, esperado, obtenido}]}`.

- [ ] **Step 1: Tests:** `parsearCelda_` para los 5 casos (Review Focus 1); migración de la fixture crea una categoría por fila (nombre del mes más reciente, `tipo` según sección: Ingresos→ingreso, Inversiones y Ahorro→ahorro, Gastos Fijos→fijo, Deudas→deuda, resto→variable), un movimiento por término con `fecha` = día de la columna y `origen='migracion'`, la nota se asigna al término con igual monto; presupuesto por mes leído de la columna Presupuesto del Resumen (fila de la categoría) y `_colchon` = 250000 cuando la fila "Total a depositar" existe; `diferencias` vacío; con un término alterado a mano, `diferencias` lo informa y **no** se llama a las vistas.
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar.** Orden en `migrar2026`: (1) `DriveApp.getFileById(id).makeCopy('Presupuesto 2026 — respaldo antes de migrar')`; (2) leer todo; (3) escribir tablas (abortar si `Movimientos` ya tiene filas `origen=migracion`); (4) verificar contra la columna TOTAL de cada mes; (5) solo si no hay diferencias y `!simular`, llamar `renderizarAnio_(2026)` (Task 4) y `setConfig_('anio_visible', 2026)`.
- [ ] **Step 4: Correr** → PASS. Además, verificación local (no commit): ejecutar la migración contra `/home/claude/work/wb.json` (export real) y confirmar `diferencias = []` y noviembre: gastado 749.759, depositar 498.966.
- [ ] **Step 5: Commit** `feat: migración de la planilla 2026 con verificación`.

### Task 4: Vistas (Resumen + meses)

**Files:**
- Create: `apps-script/Vistas.gs`, `tests/vistas.test.js`

**Interfaces:**
- Consumes: Task 1 lecturas, Task 2 `matrizMes_`, `calcularHistorial_`.
- Produces: `renderizarAnio_(anio)`, `renderizarMes_(anio, mes)` (reescribe la pestaña del mes y la columna del mes en Resumen).

- [ ] **Step 1: Tests:** después de `renderizarAnio_` en la fixture migrada: `Resumen!A1:A` contiene los bloques en el orden de Global Constraints; fila 1 = nombres de mes cada 2 columnas desde B + "Total Año"; fila 2 = "Presupuesto"/"Real"; las filas de totales coinciden con `calcularHistorial_`; pestaña `Noviembre` fila 1 = `Día,1..31,TOTAL`, la fila de Supermercado tiene el monto del día correcto; las pestañas de datos no se tocan; una celda que dice `A1 = "Año"` y `B1 = 2026` existe para seleccionar el año (lectura de `anio_visible`).
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar.** Escribir con un solo `setValues` por pestaña; formato de número `$#,##0`; negrita en cabeceras de sección y totales; las pestañas de datos al final y `Config` oculta. El selector de año es una validación de datos en `Resumen!B1` con los años presentes; un `onEdit` simple en esa celda llama `setConfig_('anio_visible')` + `renderizarAnio_`.
- [ ] **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** `feat: vistas Resumen y meses con el formato de siempre`.

### Task 5: API

**Files:**
- Create: `apps-script/Api.gs`, `tests/api.test.js`
- Delete del flujo: el formulario HTML embebido del script antiguo no se porta.

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces (todas responden JSON `{ok:true,...}` o `{ok:false,msg}`; token en `p.token` o `body.token`):
  - GET `accion=inicio&anio&mes` → `{panel, catalogo:{categorias, secciones}}` (una sola llamada al abrir la app)
  - GET `accion=movimientos&anio&mes` → `{movimientos:[{id, fecha:'yyyy-MM-dd', categoria_id, monto, nota}]}` más recientes primero
  - GET `accion=presupuesto&anio&mes` → `{items:{[categoria_id]:monto}, colchon}`
  - GET `accion=historial&anio` → `{historial}`
  - POST `registrar {fecha, categoria_id, monto, nota}` → `{movimiento, panel}`
  - POST `editar {id, fecha?, categoria_id?, monto?, nota?}` → `{movimiento, panel}`
  - POST `borrar {id}` → `{panel}`
  - POST `guardarPresupuesto {anio, mes, items, colchon}`; POST `copiarPresupuesto {anio, mes}` (copia el mes anterior, cruzando de enero a diciembre del año previo)
  - POST `guardarCategoria {id?, seccion, nombre, tipo, orden, activa}` → `{categoria}`
  - Toda escritura: `LockService.getScriptLock().waitLock(10000)` y luego `renderizarMes_` de cada mes afectado (en `editar`, el de antes y el de después: Review Focus 2). En `guardarCategoria`, `renderizarAnio_(anio_visible)`.
  - `onEditInstalable_(e)`: si la hoja editada es una de datos, `renderizarAnio_(anio_visible)`.

- [ ] **Step 1: Tests:** token incorrecto → `{ok:false, msg:'Clave incorrecta'}`; `monto` ≤ 0 o `categoria_id` inexistente → error con mensaje; ciclo registrar → editar (cambio de nov a dic) → borrar deja las vistas de nov y dic iguales a las del inicio; `copiarPresupuesto` de enero 2027 toma diciembre 2026.
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** `feat: API de la app`.

### Task 6: Año nuevo e instalación

**Files:**
- Create: `apps-script/AnioNuevo.gs`, `tests/anionuevo.test.js`

**Interfaces:**
- Consumes: Tasks 1, 4.
- Produces: `revisarAnioNuevo_(hoy=new Date())`, `instalar()` (ejecutable desde el editor: `asegurarTablas_`, crea los disparadores diario 03:00 → `revisarAnioNuevo_` y onEdit → `onEditInstalable_`, sin duplicar si ya existen).

- [ ] **Step 1: Tests:** `hoy=2026-12-20` → no hace nada; `2026-12-21` → crea 12 meses de presupuesto 2027 iguales al de diciembre 2026 (incluido `_colchon`); correrlo dos veces no duplica; `2027-01-01` → `anio_visible=2027` y se renderizan las vistas 2027; `instalar()` dos veces deja 2 disparadores, no 4.
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar.** Si el disparador falló entre el 21 y el 31, el primer día que corra lo crea igual (condición `>= 21 dic` y no existe).
- [ ] **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** `feat: año nuevo automático e instalación`.

### Task 7: Frontend — base, Inicio (anillo + sobres) y Agregar

**Files:**
- Rewrite: `index.html`; Create: `app.css`, `app.js`, `tests/ui_smoke.py`

**Interfaces:**
- Consumes: API de Task 5.
- Produces (en `app.js`): `api.get(accion, params)`, `api.post(accion, body)`; estado `st = {anio, mes, panel, catalogo}`; `irA(pantalla)` con `'inicio'|'movimientos'|'agregar'|'historial'|'ajustes'`; caché del último `inicio` en `localStorage` (envuelto en try/catch) para pintar al instante.

Pantallas según el boceto aprobado (anillo + sobres): barra inferior de 5 botones (Inicio, Movimientos, Agregar al centro, Historial, Ajustes). Inicio: selector mes/año; anillo SVG (rojo si `disponible<0`, ámbar ≥85%, verde si no) con disponible y % usado; fila `$X/día · N días · gastado de depositar`; grilla 2 columnas de sobres (`pasado` rojo, `ok` verde, `sin` gris); tocar un sobre despliega sus categorías con real/tope y los últimos 5 movimientos de esa sección (`api.get('movimientos')` filtrado en el cliente). Agregar: tipo (Gasto/Ingreso/Ahorro), monto con botones rápidos, chips de sección y categoría (solo `activa`), fecha (hoy por defecto), nota; al guardar muestra toast "Guardado · te quedan $X" y vuelve a Inicio. Pantalla Conectar igual a la actual (URL `/exec` + clave).

- [ ] **Step 1: Test de humo** `tests/ui_smoke.py` (viewport 390×844, `fetch` stub con un panel de ejemplo): el anillo muestra el disponible formateado; hay un sobre por sección con la clase de color correcta; registrar con un doble clic rápido en Guardar produce **un** POST (Review Focus 4); con `sinPresupuesto:true` se ve "Sin presupuesto este mes" (Review Focus 5); cero errores de página.
- [ ] **Step 2: Correr** `python3 tests/ui_smoke.py` → FAIL.
- [ ] **Step 3: Implementar.** Mantener los colores y el estilo iOS del `index.html` actual (variables `--ac`, `--card`, modo oscuro).
- [ ] **Step 4: Correr** → PASS; revisar las capturas a mano.
- [ ] **Step 5: Commit** `feat: app — inicio con anillo y sobres, agregar`.

### Task 8: Frontend — Movimientos e Historial

**Files:**
- Modify: `app.js`, `app.css`, `index.html`, `tests/ui_smoke.py`

- [ ] **Step 1: Tests de humo:** Movimientos lista agrupada por día con buscador (filtra por categoría o nota); al tocar uno se abre la hoja de edición; Guardar envía `editar` con solo los campos cambiados; Borrar pide un segundo toque ("¿Seguro?") antes de enviar `borrar`; Historial muestra 12 barras y la lista de meses con diferencia (+ verde / − rojo); al tocar un mes, Inicio abre ese mes.
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** `feat: app — movimientos editables e historial`.

### Task 9: Frontend — Ajustes (Presupuesto, Categorías, Conexión)

**Files:**
- Modify: `app.js`, `app.css`, `index.html`, `tests/ui_smoke.py`

- [ ] **Step 1: Tests de humo:** Presupuesto lista categorías de gasto por sección con su monto editable, sueldo esperado y colchón, con el total a depositar recalculado en vivo; "Copiar del mes anterior" llama `copiarPresupuesto` y recarga; Categorías permite crear (sección, nombre, tipo), renombrar, mover de sección, cambiar orden con flechas ↑↓ y desactivar; una categoría desactivada desaparece de Agregar; Conexión permite cambiar URL/clave.
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** `feat: app — presupuesto, categorías y conexión`.

### Task 10: Guía de puesta en marcha y verificación final

**Files:**
- Create: `docs/DEPLOY.md`

- [ ] **Step 1:** Escribir los pasos para Cristóbal: (1) en la Sheet nativa, Extensiones → Apps Script, crear los 7 archivos `.gs` y pegar; (2) Configuración del proyecto → Propiedades del script: `TOKEN`, `SHEET_ID`; (3) ejecutar `migrar2026({simular:true})` y revisar que el registro diga `diferencias: 0`; (4) ejecutar `migrar2026()` e `instalar()`; (5) Implementar → Nueva implementación → App web, ejecutar como "Yo", acceso "Cualquier usuario"; (6) subir `index.html`, `app.css` y `app.js` a GitHub; (7) en el iPhone: Conectar con la nueva URL `/exec`; (8) dejar de usar el .xlsx.
- [ ] **Step 2:** Correr la suite completa `npm test && python3 tests/ui_smoke.py` → todo PASS.
- [ ] **Step 3: Commit** `docs: guía de puesta en marcha`.
