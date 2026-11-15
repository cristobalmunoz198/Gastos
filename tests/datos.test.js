'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGas } = require('./load-gas');

const ENC = {
  Movimientos: ['id', 'fecha', 'categoria_id', 'monto', 'nota', 'origen', 'creado', 'editado'],
  'Categorías': ['id', 'seccion', 'nombre', 'tipo', 'orden', 'activa'],
  Presupuesto: ['anio', 'mes', 'categoria_id', 'monto'],
  Config: ['clave', 'valor'],
  Metas: ['id', 'nombre', 'objetivo', 'inicial', 'desde', 'fecha_limite', 'categorias', 'activa'],
};

test('asegurarTablas_ crea las 4 pestañas de datos con encabezados exactos', () => {
  const g = loadGas();
  g.asegurarTablas_();
  for (const [n, enc] of Object.entries(ENC)) assert.deepEqual(g.mock.valores(n)[0], enc, n);
  assert.equal(g.mock.hoja('Config').oculta, true);
  g.asegurarTablas_(); // idempotente
  assert.equal(g.mock.hojas.length, 5);
});

test('Config: colchon_default viene con 250000 y se puede cambiar', () => {
  const g = loadGas();
  g.asegurarTablas_();
  assert.equal(g.getConfig_('colchon_default'), 250000);
  g.setConfig_('anio_visible', 2027);
  assert.equal(g.getConfig_('anio_visible'), 2027);
  g.setConfig_('anio_visible', 2028);
  assert.equal(g.mock.valores('Config').filter(r => r[0] === 'anio_visible').length, 1);
});

test('categorías: guardar crea con id, listar respeta orden, guardar con id actualiza', () => {
  const g = loadGas();
  g.asegurarTablas_();
  const b = g.guardarCategoria_({ seccion: 'Comida', nombre: 'Café', tipo: 'variable', orden: 2, activa: true });
  g.guardarCategoria_({ seccion: 'Comida', nombre: 'Supermercado', tipo: 'variable', orden: 1, activa: true });
  assert.ok(b.id && b.id.length === 8);
  assert.deepEqual(Array.from(g.listarCategorias_().map(c => c.nombre)), ['Supermercado', 'Café']);
  g.guardarCategoria_({ id: b.id, nombre: 'Cafetería' });
  const c = g.listarCategorias_().find(x => x.id === b.id);
  assert.equal(c.nombre, 'Cafetería');
  assert.equal(c.seccion, 'Comida');
  assert.equal(c.activa, true);
});

test('movimientos: crear, listar por mes, editar y borrar', () => {
  const g = loadGas();
  g.asegurarTablas_();
  const m = g.crearMovimiento_({ fecha: new Date(2026, 10, 13), categoria_id: 'c1', monto: 24838, nota: '', origen: 'app' });
  g.crearMovimiento_({ fecha: new Date(2026, 11, 1), categoria_id: 'c1', monto: 100, nota: 'dic', origen: 'app' });
  assert.equal(g.listarMovimientos_(2026, 11).length, 1);
  assert.equal(g.listarMovimientos_(2026).length, 2);
  assert.ok(g.listarMovimientos_(2026, 11)[0].creado instanceof Date);

  const r = g.editarMovimiento_(m.id, { monto: 25000, nota: 'corregido' });
  assert.equal(r.antes.monto, 24838);
  assert.equal(r.despues.monto, 25000);
  assert.ok(r.despues.editado instanceof Date);
  assert.equal(g.listarMovimientos_(2026, 11)[0].nota, 'corregido');

  const borrado = g.borrarMovimiento_(m.id);
  assert.equal(borrado.monto, 25000);
  assert.equal(g.listarMovimientos_(2026, 11).length, 0);
  assert.throws(() => g.borrarMovimiento_('noexiste'), /No encontré/);
});

test('presupuesto: guardar dos veces el mismo mes reemplaza, no duplica', () => {
  const g = loadGas();
  g.asegurarTablas_();
  g.guardarPresupuesto_(2026, 11, { a: 1000, _colchon: 250000 });
  g.guardarPresupuesto_(2026, 11, { a: 2000, _colchon: 250000 });
  g.guardarPresupuesto_(2026, 12, { a: 5 });
  assert.equal(g.mock.valores('Presupuesto').length - 1, 3);
  assert.deepEqual(Object.assign({}, g.leerPresupuesto_(2026, 11)), { a: 2000, _colchon: 250000 });
});

test('revisión: un colchón de $0 se guarda (no vuelve al valor por defecto)', () => {
  const g = loadGas();
  g.asegurarTablas_();
  g.guardarPresupuesto_(2026, 11, { a: 1000, _colchon: 0 });
  assert.equal(g.leerPresupuesto_(2026, 11)._colchon, 0);
});
