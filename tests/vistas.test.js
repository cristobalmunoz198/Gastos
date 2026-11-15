'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGas } = require('./load-gas');
const F = require('./fixtures');

// Planilla nueva con las tablas de la fixture de cálculos
function conDatos() {
  const g = loadGas();
  g.asegurarTablas_();
  F.categorias.forEach(c => g.agregarFila_('Categorías', c));
  F.movimientos.forEach(m => g.agregarFila_('Movimientos', Object.assign({ nota: '', origen: 'app', creado: new Date(), editado: '' }, m)));
  g.guardarPresupuesto_(2026, 11, F.presNov);
  g.setConfig_('anio_visible', 2026);
  return g;
}
const colA = v => v.map(r => r[0]);
const fila = (v, label) => v.find(r => r[0] === label);

test('renderizarAnio_: Resumen con selector de año, meses y bloques en el orden de siempre', () => {
  const g = conDatos();
  g.renderizarAnio_(2026);
  const v = g.mock.valores('Resumen');
  assert.deepEqual(v[0].slice(0, 2), ['Año', 2026]);
  assert.equal(v[1][1], 'Enero'); assert.equal(v[1][3], 'Febrero'); assert.equal(v[1][21], 'Noviembre'); assert.equal(v[1][25], 'Total Año');
  assert.deepEqual(v[2].slice(1, 3), ['Presupuesto', 'Real']);
  const etiquetas = colA(v).filter(Boolean);
  assert.deepEqual(etiquetas, [
    'Año', 'Ingresos', 'Sueldos', 'Inversiones y Ahorro', 'Fondo', 'Gastos Fijos', 'Luz',
    'Gastos Variables', 'Comida', 'Supermercado', 'Café', 'Transporte', 'Bencina', 'Deudas', 'Crédito',
    'Flujo', 'Total Gasto Fijo y Variable', 'Total a depositar', 'Total a Ahorrar', 'Gastado', 'Disponible',
  ]);
  assert.ok(g.mock.hoja('Resumen').validacion, 'B1 tiene lista de años');
});

test('renderizarAnio_: montos de noviembre en Resumen (presupuesto | real) y totales', () => {
  const g = conDatos();
  g.renderizarAnio_(2026);
  const v = g.mock.valores('Resumen');
  const P = 21, R = 22; // columnas de noviembre (base 0)
  assert.deepEqual([fila(v, 'Luz')[P], fila(v, 'Luz')[R]], [25000, 30000]);
  assert.deepEqual([fila(v, 'Comida')[P], fila(v, 'Comida')[R]], [0, 58000]);
  assert.equal(fila(v, 'Gastos Variables')[R], 78000);
  assert.equal(fila(v, 'Total a depositar')[P], 220000);
  assert.equal(fila(v, 'Gastado')[P], 153000);
  assert.equal(fila(v, 'Disponible')[P], 67000);
  assert.equal(fila(v, 'Total a Ahorrar')[P], 1000000 - 220000);
  assert.equal(fila(v, 'Flujo')[R], 1000000 - 50000 - 153000);
  assert.equal(fila(v, 'Supermercado')[25 + 1], 55000 + 99000); // Total Año real
});

test('renderizarAnio_: pestaña Noviembre con matriz día a día y TOTAL', () => {
  const g = conDatos();
  g.renderizarAnio_(2026);
  const v = g.mock.valores('Noviembre');
  assert.equal(v[0][0], 'Día'); assert.equal(v[0][1], 1); assert.equal(v[0][31], 31); assert.equal(v[0][32], 'TOTAL');
  const sup = fila(v, 'Supermercado');
  assert.equal(sup[6], 55000);
  assert.equal(sup[32], 55000);
  assert.equal(sup[5], '');
  assert.ok(g.mock.hoja('Enero') && g.mock.hoja('Diciembre'));
});

test('renderizarAnio_: no toca las tablas de datos y deja las pestañas en orden', () => {
  const g = conDatos();
  const antes = g.mock.valores('Movimientos');
  g.renderizarAnio_(2026);
  assert.deepEqual(g.mock.valores('Movimientos'), antes);
  const orden = g.mock.hojas.map(h => h.nombre);
  assert.deepEqual(orden.slice(0, 13), ['Resumen', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']);
});

test('renderizarAnio_ reemplaza pestañas antiguas con el mismo nombre (sin filas sobrantes)', () => {
  const g = conDatos();
  g.mock.ss.insertSheet('Noviembre', 0);
  const h = g.mock.hoja('Noviembre');
  for (let i = 0; i < 200; i++) g.mock.ss.getSheetByName('Noviembre').appendRow(['basura ' + i, 1]);
  g.renderizarAnio_(2026);
  assert.ok(!colA(g.mock.valores('Noviembre')).some(x => String(x).startsWith('basura')));
  assert.equal(h, g.mock.hoja('Noviembre'));
});

test('renderizarMes_ no hace nada si el año no es el visible', () => {
  const g = conDatos();
  g.renderizarMes_(2027, 1);
  assert.equal(g.mock.hoja('Resumen'), undefined);
});

test('revisión: las vistas separan celdas combinadas antes de escribir', () => {
  const g = conDatos();
  g.mock.ss.insertSheet('Resumen', 0);
  g.mock.hoja('Resumen').combinada = true;
  g.renderizarAnio_(2026);
  assert.equal(g.mock.hoja('Resumen').combinada, false);
});
