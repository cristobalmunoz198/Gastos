'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGas } = require('./load-gas');
const F = require('./fixtures');

const TOKEN = 'clave-de-prueba';
function app() {
  const g = loadGas({ props: { TOKEN } });
  g.asegurarTablas_();
  F.categorias.forEach(c => g.agregarFila_('Categorías', c));
  F.movimientos.forEach(m => g.agregarFila_('Movimientos', Object.assign({ nota: '', origen: 'app', creado: new Date(), editado: '' }, m)));
  g.guardarPresupuesto_(2026, 11, F.presNov);
  g.setConfig_('anio_visible', 2026);
  g.renderizarAnio_(2026);
  return g;
}
const get = (g, p) => JSON.parse(g.doGet({ parameter: Object.assign({ token: TOKEN }, p) })._contenido);
const post = (g, b) => JSON.parse(g.doPost({ postData: { contents: JSON.stringify(Object.assign({ token: TOKEN }, b)) } })._contenido);

test('token incorrecto o ausente → Clave incorrecta', () => {
  const g = app();
  assert.deepEqual(JSON.parse(g.doGet({ parameter: { accion: 'inicio', token: 'x' } })._contenido), { ok: false, msg: 'Clave incorrecta' });
  assert.equal(JSON.parse(g.doPost({ postData: { contents: '{"accion":"borrar","id":"m1"}' } })._contenido).ok, false);
});

test('inicio devuelve panel del mes pedido y el catálogo', () => {
  const g = app();
  const r = get(g, { accion: 'inicio', anio: 2026, mes: 11 });
  assert.equal(r.ok, true);
  assert.equal(r.panel.gastado, 153000);
  assert.equal(r.catalogo.categorias.length, F.categorias.length);
  assert.deepEqual(r.catalogo.secciones.map(s => s.nombre), ['Ingresos', 'Inversiones y Ahorro', 'Gastos Fijos', 'Comida', 'Transporte', 'Deudas']);
});

test('inicio sin anio/mes usa la fecha de hoy', () => {
  const g = app();
  const r = get(g, { accion: 'inicio' });
  assert.deepEqual([r.panel.anio, r.panel.mes], [2026, 11]);
});

test('movimientos del mes, más recientes primero, con fecha yyyy-MM-dd', () => {
  const g = app();
  const r = get(g, { accion: 'movimientos', anio: 2026, mes: 11 });
  assert.equal(r.movimientos.length, 8);
  assert.equal(r.movimientos[0].fecha, '2026-11-09');
  assert.equal(r.movimientos.at(-1).fecha, '2026-11-01');
});

test('registrar valida monto y categoría', () => {
  const g = app();
  assert.match(post(g, { accion: 'registrar', fecha: '2026-11-14', categoria_id: 'sup', monto: 0 }).msg, /monto/i);
  assert.match(post(g, { accion: 'registrar', fecha: '2026-11-14', categoria_id: 'sup', monto: -10 }).msg, /monto/i);
  assert.match(post(g, { accion: 'registrar', fecha: '2026-11-14', categoria_id: 'nada', monto: 10 }).msg, /categoría/i);
  assert.equal(post(g, { accion: 'registrar', fecha: '2026-11-14', categoria_id: 'fin', monto: -5000 }).ok, true); // retiro de ahorro
});

test('registrar → editar (nov→dic) → borrar deja las vistas como estaban', () => {
  const g = app();
  const nov0 = g.mock.valores('Noviembre'), dic0 = g.mock.valores('Diciembre'), res0 = g.mock.valores('Resumen');

  const a = post(g, { accion: 'registrar', fecha: '2026-11-14', categoria_id: 'sup', monto: 12500, nota: 'almuerzo' });
  assert.equal(a.ok, true);
  g.redibujarPendientes();
  assert.equal(g.mock.valores('Noviembre').find(r => r[0] === 'Supermercado')[14], 12500);

  const e = post(g, { accion: 'editar', id: a.movimiento.id, fecha: '2026-12-02', monto: 13000 });
  assert.equal(e.ok, true);
  g.redibujarPendientes();
  assert.equal(g.mock.valores('Noviembre').find(r => r[0] === 'Supermercado')[14], '');
  assert.equal(g.mock.valores('Diciembre').find(r => r[0] === 'Supermercado')[2], 13000);

  const b = post(g, { accion: 'borrar', id: a.movimiento.id });
  assert.equal(b.ok, true);
  g.redibujarPendientes();
  assert.deepEqual(g.mock.valores('Noviembre'), nov0);
  assert.deepEqual(g.mock.valores('Diciembre'), dic0);
  assert.deepEqual(g.mock.valores('Resumen'), res0);
});

test('presupuesto: guardar, leer y copiar del mes anterior cruzando el año', () => {
  const g = app();
  assert.equal(post(g, { accion: 'guardarPresupuesto', anio: 2026, mes: 12, items: { luz: 26000, sup: 200000 }, colchon: 200000 }).ok, true);
  const p = get(g, { accion: 'presupuesto', anio: 2026, mes: 12 });
  assert.deepEqual(p.items, { luz: 26000, sup: 200000 });
  assert.equal(p.colchon, 200000);
  assert.equal(post(g, { accion: 'copiarPresupuesto', anio: 2027, mes: 1 }).ok, true);
  assert.deepEqual(get(g, { accion: 'presupuesto', anio: 2027, mes: 1 }).items, { luz: 26000, sup: 200000 });
  assert.equal(get(g, { accion: 'presupuesto', anio: 2027, mes: 1 }).colchon, 200000);
});

test('presupuesto sin colchón del mes devuelve el colchón por defecto', () => {
  const g = app();
  assert.equal(get(g, { accion: 'presupuesto', anio: 2026, mes: 5 }).colchon, 250000);
});

test('guardarCategoria crea, renombra y desactiva; valida el tipo', () => {
  const g = app();
  const c = post(g, { accion: 'guardarCategoria', seccion: 'Comida', nombre: 'Delivery', tipo: 'variable' });
  assert.equal(c.ok, true);
  g.redibujarPendientes();
  assert.ok(g.mock.valores('Resumen').some(r => r[0] === 'Delivery'));
  assert.equal(post(g, { accion: 'guardarCategoria', id: 'caf', nombre: 'Cafetería' }).ok, true);
  g.redibujarPendientes();
  assert.ok(g.mock.valores('Noviembre').some(r => r[0] === 'Cafetería'));
  assert.match(post(g, { accion: 'guardarCategoria', seccion: 'X', nombre: 'Y', tipo: 'raro' }).msg, /tipo/i);
});

test('historial del año: 12 meses', () => {
  const g = app();
  const h = get(g, { accion: 'historial', anio: 2026 });
  assert.equal(h.historial.length, 12);
  assert.equal(h.historial[10].gastado, 153000);
});

test('alEditar: editar Movimientos a mano redibuja; cambiar el año en Resumen!B1 cambia anio_visible', () => {
  const g = app();
  g.mock.ss.getSheetByName('Movimientos').appendRow(['manual1', new Date(2026, 10, 20), 'sup', 7777, '', 'app', new Date(), '']);
  g.alEditar({ range: { getSheet: () => g.mock.ss.getSheetByName('Movimientos'), getRow: () => 11, getColumn: () => 4 } });
  assert.equal(g.mock.valores('Noviembre').find(r => r[0] === 'Supermercado')[20], 7777);

  g.mock.ss.getSheetByName('Resumen').getRange(1, 2).setValue(2027);
  g.alEditar({ range: { getSheet: () => g.mock.ss.getSheetByName('Resumen'), getRow: () => 1, getColumn: () => 2 }, value: '2027' });
  assert.equal(Number(g.getConfig_('anio_visible')), 2027);
  assert.equal(g.mock.valores('Resumen')[0][1], 2027);
});

test('acción desconocida → error claro', () => {
  const g = app();
  assert.match(get(g, { accion: 'volar' }).msg, /Acción desconocida/);
});

test('rendimiento: registrar lee cada tabla de datos una sola vez', () => {
  const g = app();
  Object.keys(g.mock.lecturas).forEach(k => delete g.mock.lecturas[k]);
  assert.equal(post(g, { accion: 'registrar', fecha: '2026-11-14', categoria_id: 'sup', monto: 100 }).ok, true);
  const L = g.mock.lecturas;
  assert.ok((L['Presupuesto'] || 0) <= 1, 'Presupuesto leído ' + L['Presupuesto'] + ' veces');
  assert.ok((L['Movimientos'] || 0) <= 2, 'Movimientos leído ' + L['Movimientos'] + ' veces');
  assert.ok((L['Categorías'] || 0) <= 1, 'Categorías leído ' + L['Categorías'] + ' veces');
});

/* ───────── Versión rápida ───────── */

test('rápida: datos del año en una sola llamada', () => {
  const g = app();
  const d = get(g, { accion: 'datos', anio: 2026 });
  assert.equal(d.anio, 2026);
  assert.equal(d.categorias.length, F.categorias.length);
  assert.equal(d.movimientos.length, F.movimientos.length);
  assert.equal(d.movimientos.find(m => m.id === 'm4').fecha, '2026-11-06');
  assert.deepEqual(d.presupuestos['11'], F.presNov);
  assert.equal(d.colchonDefault, 250000);
});

test('rápida: guardar no redibuja la planilla en el momento; deja un redibujo programado', () => {
  const g = app();
  const nov0 = g.mock.valores('Noviembre');
  assert.equal(post(g, { accion: 'registrar', id: 'cli00001', fecha: '2026-11-14', categoria_id: 'sup', monto: 500 }).ok, true);
  assert.deepEqual(g.mock.valores('Noviembre'), nov0);
  const pend = g.mock.triggers.filter(t => t.fn === 'redibujarPendientes');
  assert.equal(pend.length, 1);
  post(g, { accion: 'registrar', id: 'cli00002', fecha: '2026-11-14', categoria_id: 'sup', monto: 500 });
  assert.equal(g.mock.triggers.filter(t => t.fn === 'redibujarPendientes').length, 1, 'no duplica el disparador');
  g.redibujarPendientes();
  assert.equal(g.mock.valores('Noviembre').find(r => r[0] === 'Supermercado')[14], 1000);
  assert.equal(g.mock.triggers.filter(t => t.fn === 'redibujarPendientes').length, 0, 'se borra al terminar');
});

test('rápida: registrar con el mismo id dos veces no duplica (reintentos sin señal)', () => {
  const g = app();
  const b = { accion: 'registrar', id: 'cli00009', fecha: '2026-11-14', categoria_id: 'sup', monto: 700 };
  assert.equal(post(g, b).ok, true);
  assert.equal(post(g, b).ok, true);
  assert.equal(g.listarMovimientos_(2026, 11).filter(m => m.id === 'cli00009').length, 1);
});

test('rápida: borrar algo que ya no existe responde ok (reintento)', () => {
  const g = app();
  assert.equal(post(g, { accion: 'borrar', id: 'm7' }).ok, true);
  assert.equal(post(g, { accion: 'borrar', id: 'm7' }).ok, true);
});

test('rápida: crear categoría con id del teléfono', () => {
  const g = app();
  assert.equal(post(g, { accion: 'guardarCategoria', id: 'cliCat01', seccion: 'Comida', nombre: 'Delivery', tipo: 'variable' }).ok, true);
  assert.equal(g.listarCategorias_().find(c => c.id === 'cliCat01').nombre, 'Delivery');
});

/* ───────── Metas de ahorro ───────── */

test('metas: crear con id del teléfono, aparece en datos con lo ahorrado en años anteriores', () => {
  const g = app();
  g.agregarFila_('Movimientos', { id: 'v1', fecha: new Date(2025, 11, 1), categoria_id: 'fin', monto: 30000, nota: '', origen: 'app', creado: new Date(), editado: '' });
  g.agregarFila_('Movimientos', { id: 'v2', fecha: new Date(2025, 0, 1), categoria_id: 'fin', monto: 99999, nota: '', origen: 'app', creado: new Date(), editado: '' }); // antes de "desde"
  const r = post(g, { accion: 'guardarMeta', id: 'meta0001', nombre: 'Viaje', objetivo: 1000000, inicial: 100000, desde: '2025-06-01', fecha_limite: '2027-03-31', categorias: ['fin'] });
  assert.equal(r.ok, true, r.msg);
  const d = get(g, { accion: 'datos', anio: 2026 });
  assert.equal(d.metas.length, 1);
  const m = d.metas[0];
  assert.deepEqual([m.id, m.nombre, m.objetivo, m.inicial, m.desde, m.fecha_limite, m.categorias, m.activa],
    ['meta0001', 'Viaje', 1000000, 100000, '2025-06-01', '2027-03-31', ['fin'], true]);
  assert.equal(m.acumuladoAntes, 30000);
});

test('metas: editar, validar y borrar (borrar dos veces responde ok)', () => {
  const g = app();
  post(g, { accion: 'guardarMeta', id: 'meta0002', nombre: 'Fondo', objetivo: 500000, desde: '2026-01-01', categorias: ['fin'] });
  assert.equal(post(g, { accion: 'guardarMeta', id: 'meta0002', objetivo: 600000 }).ok, true);
  assert.equal(get(g, { accion: 'datos', anio: 2026 }).metas[0].objetivo, 600000);
  assert.equal(get(g, { accion: 'datos', anio: 2026 }).metas[0].nombre, 'Fondo');
  assert.match(post(g, { accion: 'guardarMeta', id: 'meta0003', nombre: '', objetivo: 1 }).msg, /nombre/i);
  assert.match(post(g, { accion: 'guardarMeta', id: 'meta0003', nombre: 'X', objetivo: 0 }).msg, /objetivo/i);
  assert.equal(post(g, { accion: 'borrarMeta', id: 'meta0002' }).ok, true);
  assert.equal(post(g, { accion: 'borrarMeta', id: 'meta0002' }).ok, true);
  assert.equal(get(g, { accion: 'datos', anio: 2026 }).metas.length, 0);
});
