'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGas } = require('./load-gas');
const F = require('./fixtures');

function app() {
  const g = loadGas({ props: { TOKEN: 't' } });
  g.asegurarTablas_();
  F.categorias.forEach(c => g.agregarFila_('Categorías', c));
  g.guardarPresupuesto_(2026, 12, { luz: 26000, ben: 50000, _colchon: 200000 });
  g.setConfig_('anio_visible', 2026);
  return g;
}

test('revisarAnioNuevo: el 20 de diciembre todavía no crea nada', () => {
  const g = app();
  g.revisarAnioNuevo(new Date(2026, 11, 20, 3));
  assert.equal(Object.keys(g.leerPresupuesto_(2027, 1)).length, 0);
});

test('revisarAnioNuevo: desde el 21 de diciembre crea los 12 meses del año siguiente con el presupuesto de diciembre', () => {
  const g = app();
  g.revisarAnioNuevo(new Date(2026, 11, 21, 3));
  for (let m = 1; m <= 12; m++) {
    assert.deepEqual(Object.assign({}, g.leerPresupuesto_(2027, m)), { luz: 26000, ben: 50000, _colchon: 200000 }, 'mes ' + m);
  }
  assert.equal(Number(g.getConfig_('anio_visible')), 2026);   // todavía se ve 2026
});

test('revisarAnioNuevo: correrlo dos veces no duplica', () => {
  const g = app();
  g.revisarAnioNuevo(new Date(2026, 11, 21, 3));
  g.revisarAnioNuevo(new Date(2026, 11, 28, 3));
  assert.equal(g.leerTabla_('Presupuesto').filter(r => Number(r.anio) === 2027).length, 36);
});

test('revisarAnioNuevo: si no corrió antes, el 30 de diciembre igual lo crea', () => {
  const g = app();
  g.revisarAnioNuevo(new Date(2026, 11, 30, 3));
  assert.equal(Object.keys(g.leerPresupuesto_(2027, 6)).length, 3);
});

test('revisarAnioNuevo: el 1 de enero cambia el año visible y dibuja las vistas del año nuevo', () => {
  const g = app();
  g.revisarAnioNuevo(new Date(2026, 11, 21, 3));
  g.revisarAnioNuevo(new Date(2027, 0, 1, 3));
  assert.equal(Number(g.getConfig_('anio_visible')), 2027);
  assert.equal(g.mock.valores('Resumen')[0][1], 2027);
});

test('instalar: crea tablas y 2 disparadores, sin duplicar al repetir', () => {
  const g = loadGas({ props: { TOKEN: 't' } });
  g.instalar();
  g.instalar();
  assert.ok(g.mock.hoja('Movimientos'));
  assert.deepEqual(g.mock.triggers.map(t => [t.fn, t.tipo]).sort(), [['alEditar', 'edicion'], ['revisarAnioNuevo', 'tiempo']]);
});
