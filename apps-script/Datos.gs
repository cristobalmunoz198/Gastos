/**
 * Datos.gs — tablas simples (una fila por registro, encabezados en la fila 1).
 */

/** Crea las pestañas de datos que falten, al final del archivo. Config queda oculta. */
function asegurarTablas_() {
  limpiarCache_();
  const ss = getSS_();
  Object.keys(ENCABEZADOS).forEach(nombre => {
    if (ss.getSheetByName(nombre)) return;
    const sh = ss.insertSheet(nombre, ss.getNumSheets());
    sh.appendRow(ENCABEZADOS[nombre]);
    sh.setFrozenRows(1);
    if (nombre === HOJAS.CONF) {
      Object.keys(CONFIG_INICIAL).forEach(k => sh.appendRow([k, CONFIG_INICIAL[k]]));
      sh.hideSheet();
    }
  });
}

function hojaDatos_(nombre) {
  const sh = getSS_().getSheetByName(nombre);
  if (!sh) throw new Error('Falta la pestaña "' + nombre + '". Ejecuta instalar() en el editor.');
  return sh;
}

/* Caché de lecturas dentro de una misma ejecución (cada llamada de la app es una ejecución nueva).
   Toda escritura invalida la tabla que toca. */
let CACHE_TABLAS_ = {};
function limpiarCache_() { CACHE_TABLAS_ = {}; }
function invalidar_(nombre) { delete CACHE_TABLAS_[nombre]; }

/** Lee una tabla como lista de objetos { encabezado: valor }; agrega _fila (número de fila real). */
function leerTabla_(nombre) {
  if (!CACHE_TABLAS_[nombre]) CACHE_TABLAS_[nombre] = leerTablaHoja_(nombre);
  return CACHE_TABLAS_[nombre].map(o => Object.assign({}, o));
}

function leerTablaHoja_(nombre) {
  const sh = getSS_().getSheetByName(nombre);
  if (!sh || sh.getLastRow() < 2) return [];
  const vals = sh.getRange(1, 1, sh.getLastRow(), ENCABEZADOS[nombre].length).getValues();
  const enc = vals[0];
  const out = [];
  for (let i = 1; i < vals.length; i++) {
    if (vals[i].every(x => x === '' || x === null)) continue;
    const o = { _fila: i + 1 };
    enc.forEach((k, j) => { o[k] = vals[i][j]; });
    out.push(o);
  }
  return out;
}

function filaDesdeObjeto_(nombre, o) {
  return ENCABEZADOS[nombre].map(k => (o[k] === undefined || o[k] === null) ? '' : o[k]);
}

function limpiar_(o) {
  const c = Object.assign({}, o);
  delete c._fila;
  return c;
}

function agregarFila_(nombre, o) {
  invalidar_(nombre);
  hojaDatos_(nombre).appendRow(filaDesdeObjeto_(nombre, o));
  return o;
}

function buscarPorId_(nombre, id) {
  return leerTabla_(nombre).find(r => String(r.id) === String(id)) || null;
}

function actualizarPorId_(nombre, id, cambios) {
  const actual = buscarPorId_(nombre, id);
  if (!actual) return null;
  const nuevo = Object.assign({}, actual, cambios, { id: actual.id });
  invalidar_(nombre);
  hojaDatos_(nombre).getRange(actual._fila, 1, 1, ENCABEZADOS[nombre].length).setValues([filaDesdeObjeto_(nombre, nuevo)]);
  return limpiar_(nuevo);
}

function borrarPorId_(nombre, id) {
  const actual = buscarPorId_(nombre, id);
  if (!actual) return null;
  invalidar_(nombre);
  hojaDatos_(nombre).deleteRow(actual._fila);
  return limpiar_(actual);
}

function nuevoId_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 8);
}

/* ───────── Categorías ───────── */

function aBool_(x) {
  return !(x === false || x === 'FALSE' || x === 'false' || x === 0 || x === 'NO');
}

function listarCategorias_() {
  return leerTabla_(HOJAS.CAT)
    .map(c => Object.assign(limpiar_(c), { id: String(c.id), orden: Number(c.orden) || 0, activa: aBool_(c.activa) }))
    .sort((a, b) => a.orden - b.orden);
}

function guardarCategoria_(c) {
  if (c.id) {
    const r = actualizarPorId_(HOJAS.CAT, c.id, limpiarIndefinidos_(c));
    if (!r) throw new Error('No encontré la categoría');
    return Object.assign(r, { activa: aBool_(r.activa) });
  }
  if (!c.nombre || !c.seccion || !c.tipo) throw new Error('Falta nombre, sección o tipo');
  const cats = listarCategorias_();
  const nueva = {
    id: c.idNuevo || nuevoId_(), seccion: c.seccion, nombre: String(c.nombre).trim(), tipo: c.tipo,
    orden: (c.orden !== undefined && c.orden !== '') ? Number(c.orden) : (cats.length ? cats[cats.length - 1].orden + 1 : 1),
    activa: c.activa === undefined ? true : aBool_(c.activa),
  };
  agregarFila_(HOJAS.CAT, nueva);
  return nueva;
}

function limpiarIndefinidos_(o) {
  const r = {};
  Object.keys(o).forEach(k => { if (o[k] !== undefined) r[k] = o[k]; });
  return r;
}

/* ───────── Movimientos ───────── */

function normalizarMov_(m) {
  return Object.assign(limpiar_(m), {
    id: String(m.id),
    categoria_id: String(m.categoria_id),
    monto: Number(m.monto) || 0,
    fecha: m.fecha instanceof Date ? m.fecha : new Date(m.fecha),
  });
}

/** Movimientos de un año (y mes 1–12 si se indica) */
function listarMovimientos_(anio, mes) {
  return leerTabla_(HOJAS.MOV).map(normalizarMov_).filter(m =>
    m.fecha.getFullYear() === Number(anio) && (!mes || m.fecha.getMonth() + 1 === Number(mes)));
}

function crearMovimiento_(d) {
  const m = {
    id: d.id || nuevoId_(), fecha: soloFecha_(d.fecha), categoria_id: String(d.categoria_id), monto: Number(d.monto),
    nota: d.nota || '', origen: d.origen || 'app', creado: new Date(), editado: '',
  };
  agregarFila_(HOJAS.MOV, m);
  return m;
}

function editarMovimiento_(id, cambios) {
  const antes = buscarPorId_(HOJAS.MOV, id);
  if (!antes) throw new Error('No encontré ese movimiento');
  const c = limpiarIndefinidos_({
    fecha: cambios.fecha !== undefined ? soloFecha_(cambios.fecha) : undefined,
    categoria_id: cambios.categoria_id !== undefined ? String(cambios.categoria_id) : undefined,
    monto: cambios.monto !== undefined ? Number(cambios.monto) : undefined,
    nota: cambios.nota,
  });
  c.editado = new Date();
  const despues = actualizarPorId_(HOJAS.MOV, id, c);
  return { antes: normalizarMov_(antes), despues: normalizarMov_(despues) };
}

function borrarMovimiento_(id) {
  const m = borrarPorId_(HOJAS.MOV, id);
  if (!m) throw new Error('No encontré ese movimiento');
  return normalizarMov_(m);
}

/** Acepta Date o 'yyyy-MM-dd' y devuelve un Date a medianoche local */
function soloFecha_(f) {
  if (f instanceof Date) return new Date(f.getFullYear(), f.getMonth(), f.getDate());
  const m = String(f).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) throw new Error('Fecha inválida: ' + f);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/* ───────── Presupuesto ───────── */

function leerPresupuesto_(anio, mes) {
  const out = {};
  leerTabla_(HOJAS.PRES).forEach(r => {
    if (Number(r.anio) === Number(anio) && Number(r.mes) === Number(mes)) out[String(r.categoria_id)] = Number(r.monto) || 0;
  });
  return out;
}

/** Reemplaza todo el presupuesto de ese mes por el mapa { categoria_id: monto } */
function guardarPresupuesto_(anio, mes, mapa) {
  const sh = hojaDatos_(HOJAS.PRES);
  const filas = leerTabla_(HOJAS.PRES)
    .filter(r => Number(r.anio) === Number(anio) && Number(r.mes) === Number(mes))
    .map(r => r._fila).sort((a, b) => b - a);
  invalidar_(HOJAS.PRES);
  filas.forEach(f => sh.deleteRow(f));
  Object.keys(mapa).forEach(k => {
    const v = Number(mapa[k]);
    if (v || (k === '_colchon' && mapa[k] !== '' && mapa[k] !== null)) sh.appendRow([Number(anio), Number(mes), k, v]);
  });
}

/* ───────── Metas de ahorro ───────── */

function textoFecha_(x) {
  if (x instanceof Date) return Utilities.formatDate(x, TZ, 'yyyy-MM-dd');
  return x ? String(x).replace(/^'/, '').slice(0, 10) : '';
}

function listarMetas_() {
  return leerTabla_(HOJAS.METAS).map(m => ({
    id: String(m.id), nombre: String(m.nombre), objetivo: Number(m.objetivo) || 0, inicial: Number(m.inicial) || 0,
    desde: textoFecha_(m.desde), fecha_limite: textoFecha_(m.fecha_limite),
    categorias: String(m.categorias || '').split(',').map(x => x.trim()).filter(Boolean),
    activa: aBool_(m.activa),
  }));
}

/** Crea (con el id que manda el teléfono) o actualiza una meta */
function guardarMeta_(b) {
  const actual = listarMetas_().find(m => m.id === String(b.id));
  const m = Object.assign({ inicial: 0, desde: '', fecha_limite: '', categorias: [], activa: true }, actual || {}, limpiarIndefinidos_({
    nombre: b.nombre !== undefined ? String(b.nombre).trim() : undefined,
    objetivo: b.objetivo !== undefined ? Number(b.objetivo) : undefined,
    inicial: b.inicial !== undefined ? Number(b.inicial) || 0 : undefined,
    desde: b.desde, fecha_limite: b.fecha_limite, categorias: b.categorias, activa: b.activa,
  }));
  if (!m.nombre) throw new Error('La meta necesita un nombre');
  if (!(m.objetivo > 0)) throw new Error('El objetivo debe ser mayor que 0');
  // "'" adelante: que Sheets guarde la fecha como texto y no la convierta
  const fila = { id: String(b.id || nuevoId_()), nombre: m.nombre, objetivo: m.objetivo, inicial: m.inicial,
    desde: m.desde ? "'" + m.desde : '', fecha_limite: m.fecha_limite ? "'" + m.fecha_limite : '',
    categorias: (m.categorias || []).join(','), activa: aBool_(m.activa) };
  if (actual) actualizarPorId_(HOJAS.METAS, fila.id, fila); else agregarFila_(HOJAS.METAS, fila);
  return listarMetas_().find(x => x.id === fila.id);
}
