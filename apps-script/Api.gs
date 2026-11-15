/**
 * Api.gs — lo que llama la app del iPhone.
 *   GET  ?formato=json&token=…&accion=inicio|movimientos|presupuesto|historial
 *   POST {token, accion: registrar|editar|borrar|guardarPresupuesto|copiarPresupuesto|guardarCategoria, …}
 * Toda respuesta es JSON: {ok:true, …} o {ok:false, msg}
 */

const TIPOS_VALIDOS = ['ingreso', 'ahorro', 'fijo', 'variable', 'deuda'];

function doGet(e) {
  return responder_(() => {
    const p = (e && e.parameter) || {};
    validarToken_(p.token);
    const acc = p.accion || 'inicio';
    const ref = anioMes_(p.anio, p.mes);
    if (acc === 'inicio') return { panel: panel_(ref.anio, ref.mes), catalogo: catalogo_() };
    if (acc === 'movimientos') return { movimientos: movimientosMes_(ref.anio, ref.mes) };
    if (acc === 'presupuesto') return presupuestoMes_(ref.anio, ref.mes);
    if (acc === 'historial') return { historial: historial_(ref.anio) };
    if (acc === 'datos') return datosApp_(ref.anio);
    throw new Error('Acción desconocida: ' + acc);
  });
}

function doPost(e) {
  return responder_(() => {
    const b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    validarToken_(b.token);
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      if (b.accion === 'registrar') return registrar_(b);
      if (b.accion === 'editar') return editar_(b);
      if (b.accion === 'borrar') return borrar_(b);
      if (b.accion === 'guardarPresupuesto') return guardarPresupuestoApi_(b);
      if (b.accion === 'copiarPresupuesto') return copiarPresupuestoApi_(b);
      if (b.accion === 'guardarCategoria') return guardarCategoriaApi_(b);
      if (b.accion === 'guardarMeta') { asegurarTablas_(); return { meta: guardarMeta_(b) }; }
      if (b.accion === 'borrarMeta') { if (getSS_().getSheetByName(HOJAS.METAS)) borrarPorId_(HOJAS.METAS, b.id); return {}; }
      throw new Error('Acción desconocida: ' + b.accion);
    } finally {
      lock.releaseLock();
    }
  });
}

function responder_(fn) {
  limpiarCache_();
  let out;
  try { out = Object.assign({ ok: true }, fn()); }
  catch (err) { out = { ok: false, msg: err.message }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function validarToken_(t) {
  const token = prop_('TOKEN');
  if (!token) throw new Error('Falta configurar TOKEN en las propiedades del script');
  if (String(t || '') !== token) throw new Error('Clave incorrecta');
}

function anioMes_(anio, mes) {
  const h = hoy_();
  return { anio: Number(anio) || h.getFullYear(), mes: Number(mes) || h.getMonth() + 1 };
}

/* ───────── Lecturas ───────── */

function panel_(anio, mes) {
  return calcularPanel_({
    categorias: listarCategorias_(), movimientos: listarMovimientos_(anio, mes),
    presupuesto: leerPresupuesto_(anio, mes), colchonDefault: Number(getConfig_('colchon_default')) || 0,
    anio: anio, mes: mes, hoy: hoy_(),
  });
}

function catalogo_() {
  const categorias = listarCategorias_();
  const secciones = [];
  categorias.forEach(c => { if (!secciones.some(s => s.nombre === c.seccion)) secciones.push({ nombre: c.seccion, tipo: c.tipo }); });
  return { categorias: categorias, secciones: secciones };
}

function fechaTexto_(d) {
  return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
}

function movimientoApi_(m) {
  return { id: m.id, fecha: fechaTexto_(m.fecha), categoria_id: m.categoria_id, monto: m.monto, nota: m.nota || '', origen: m.origen || '' };
}

function movimientosMes_(anio, mes) {
  return listarMovimientos_(anio, mes)
    .sort((a, b) => (b.fecha - a.fecha) || (new Date(b.creado) - new Date(a.creado)))
    .map(movimientoApi_);
}

function presupuestoMes_(anio, mes) {
  const p = leerPresupuesto_(anio, mes);
  const colchon = p._colchon !== undefined ? p._colchon : (Number(getConfig_('colchon_default')) || 0);
  delete p._colchon;
  return { items: p, colchon: colchon };
}

function historial_(anio) {
  const pres = {};
  for (let m = 1; m <= 12; m++) pres[m] = leerPresupuesto_(anio, m);
  return calcularHistorial_({
    categorias: listarCategorias_(), movimientos: listarMovimientos_(anio), presupuestosPorMes: pres,
    colchonDefault: Number(getConfig_('colchon_default')) || 0, anio: anio,
  });
}

/** Todo lo que la app necesita del año en una sola llamada (la app calcula el resto en el teléfono) */
function datosApp_(anio) {
  const presupuestos = {};
  for (let m = 1; m <= 12; m++) presupuestos[m] = leerPresupuesto_(anio, m);
  return {
    anio: anio,
    categorias: listarCategorias_(),
    movimientos: listarMovimientos_(anio).map(movimientoApi_),
    presupuestos: presupuestos,
    colchonDefault: Number(getConfig_('colchon_default')) || 0,
    metas: metasConAcumulado_(anio),
  };
}

/** Metas + lo ahorrado en años anteriores al pedido (el teléfono suma el año en curso) */
function metasConAcumulado_(anio) {
  if (!getSS_().getSheetByName(HOJAS.METAS)) return [];
  const metas = listarMetas_();
  if (!metas.length) return [];
  const movs = leerTabla_(HOJAS.MOV).map(normalizarMov_).filter(m => m.fecha.getFullYear() < anio);
  return metas.map(meta => {
    const desde = meta.desde ? soloFecha_(meta.desde) : new Date(0);
    const acumuladoAntes = movs.reduce((s, m) => s + (meta.categorias.indexOf(m.categoria_id) > -1 && m.fecha >= desde ? m.monto : 0), 0);
    return Object.assign(meta, { acumuladoAntes: acumuladoAntes });
  });
}

/* ───────── Redibujo diferido de la planilla ─────────
   Guardar solo escribe la fila (rápido). La planilla (Resumen y meses) se redibuja
   ~1 minuto después con un disparador de una sola vez. */

function marcarPendiente_(anio, mes) {
  let p = {};
  try { p = JSON.parse(getConfig_('pendiente') || '{}'); } catch (e) {}
  const k = String(anio);
  if (mes === 'todo' || p[k] === 'todo') p[k] = 'todo';
  else { p[k] = p[k] || []; if (p[k].indexOf(mes) < 0) p[k].push(mes); }
  setConfig_('pendiente', JSON.stringify(p));
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'redibujarPendientes')) {
    ScriptApp.newTrigger('redibujarPendientes').timeBased().after(60 * 1000).create();
  }
}

/** Lo ejecuta el disparador: redibuja lo que quedó pendiente del año visible */
function redibujarPendientes() {
  limpiarCache_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    let p = {};
    try { p = JSON.parse(getConfig_('pendiente') || '{}'); } catch (e) {}
    setConfig_('pendiente', '{}');
    ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'redibujarPendientes').forEach(t => ScriptApp.deleteTrigger(t));
    const anio = Number(getConfig_('anio_visible')) || hoy_().getFullYear();
    const q = p[String(anio)];
    if (!q) return;
    if (q === 'todo') { renderizarAnio_(anio); return; }
    const D = datosAnio_(anio);
    renderizarResumen_(anio, D);
    q.forEach(m => renderizarPestanaMes_(anio, Number(m), D));
  } finally {
    lock.releaseLock();
  }
}

/* ───────── Escrituras ───────── */

function validarMovimiento_(b) {
  const cat = listarCategorias_().find(c => c.id === String(b.categoria_id));
  if (!cat) throw new Error('No existe esa categoría');
  const monto = Number(b.monto);
  if (!monto || isNaN(monto)) throw new Error('Monto inválido');
  // Solo ingresos y ahorro aceptan montos negativos (ej. un retiro de ahorro)
  if (monto < 0 && ['ingreso', 'ahorro'].indexOf(cat.tipo) < 0) throw new Error('Monto inválido: debe ser mayor que 0');
  return cat;
}

function mesDe_(f) {
  return { anio: f.getFullYear(), mes: f.getMonth() + 1 };
}

function registrar_(b) {
  // Si el teléfono reintenta (sin señal), el mismo id no se duplica
  if (b.id) { const ya = buscarPorId_(HOJAS.MOV, b.id); if (ya) return { movimiento: movimientoApi_(normalizarMov_(ya)) }; }
  validarMovimiento_(b);
  const m = crearMovimiento_({ id: b.id, fecha: b.fecha || fechaTexto_(hoy_()), categoria_id: b.categoria_id, monto: Number(b.monto), nota: b.nota, origen: 'app' });
  const r = mesDe_(m.fecha);
  marcarPendiente_(r.anio, r.mes);
  return { movimiento: movimientoApi_(m) };
}

function editar_(b) {
  const actual = buscarPorId_(HOJAS.MOV, b.id);
  if (!actual) throw new Error('No encontré ese movimiento');
  validarMovimiento_({
    categoria_id: b.categoria_id !== undefined ? b.categoria_id : actual.categoria_id,
    monto: b.monto !== undefined ? b.monto : actual.monto,
  });
  const r = editarMovimiento_(b.id, { fecha: b.fecha, categoria_id: b.categoria_id, monto: b.monto, nota: b.nota });
  const a = mesDe_(r.antes.fecha), d = mesDe_(r.despues.fecha);
  marcarPendiente_(d.anio, d.mes);
  if (a.anio !== d.anio || a.mes !== d.mes) marcarPendiente_(a.anio, a.mes);
  return { movimiento: movimientoApi_(r.despues) };
}

function borrar_(b) {
  if (!buscarPorId_(HOJAS.MOV, b.id)) return { yaNoExiste: true };   // reintento: ya estaba borrado
  const m = borrarMovimiento_(b.id);
  const r = mesDe_(m.fecha);
  marcarPendiente_(r.anio, r.mes);
  return {};
}

function guardarPresupuestoApi_(b) {
  const mapa = Object.assign({}, b.items || {});
  if (b.colchon !== undefined && b.colchon !== '') mapa._colchon = Number(b.colchon);
  guardarPresupuesto_(b.anio, b.mes, mapa);
  marcarPendiente_(Number(b.anio), Number(b.mes));
  return presupuestoMes_(Number(b.anio), Number(b.mes));
}

function copiarPresupuestoApi_(b) {
  const anio = Number(b.anio), mes = Number(b.mes);
  const ant = mes === 1 ? { anio: anio - 1, mes: 12 } : { anio: anio, mes: mes - 1 };
  const prev = leerPresupuesto_(ant.anio, ant.mes);
  if (!Object.keys(prev).length) throw new Error('El mes anterior no tiene presupuesto');
  guardarPresupuesto_(anio, mes, prev);
  marcarPendiente_(anio, mes);
  return presupuestoMes_(anio, mes);
}

function guardarCategoriaApi_(b) {
  if (b.tipo !== undefined && TIPOS_VALIDOS.indexOf(b.tipo) < 0) throw new Error('Tipo inválido: usa ingreso, ahorro, fijo, variable o deuda');
  const existe = b.id && buscarPorId_(HOJAS.CAT, b.id);
  const c = guardarCategoria_(limpiarIndefinidos_({
    id: existe ? b.id : undefined, idNuevo: existe ? undefined : b.id, seccion: b.seccion, nombre: b.nombre !== undefined ? String(b.nombre).trim() : undefined,
    tipo: b.tipo, orden: b.orden, activa: b.activa,
  }));
  marcarPendiente_(Number(getConfig_('anio_visible')) || hoy_().getFullYear(), 'todo');
  return { categoria: c, catalogo: catalogo_() };
}

/* ───────── Disparador al editar la planilla a mano (lo crea instalar()) ───────── */

function alEditar(e) {
  limpiarCache_();
  const sh = e && e.range && e.range.getSheet();
  if (!sh) return;
  const nombre = sh.getName();
  if (nombre === 'Resumen' && e.range.getRow() === 1 && e.range.getColumn() === 2) {
    const anio = Number(e.value || sh.getRange(1, 2).getValue());
    if (anio) { setConfig_('anio_visible', anio); renderizarAnio_(anio); }
    return;
  }
  if ([HOJAS.MOV, HOJAS.CAT, HOJAS.PRES].indexOf(nombre) > -1) {
    renderizarAnio_(Number(getConfig_('anio_visible')) || hoy_().getFullYear());
  }
}
