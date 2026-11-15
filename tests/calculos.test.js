'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGas } = require('./load-gas');
const F = require('./fixtures');

const g = loadGas();
const plano = x => JSON.parse(JSON.stringify(x));
const panel = (extra = {}) => plano(g.calcularPanel_(Object.assign({
  categorias: F.categorias, movimientos: F.movimientos, presupuesto: F.presNov,
  colchonDefault: 250000, anio: 2026, mes: 11, hoy: F.d(11, 14),
}, extra)));

test('panel: gastado suma fijo+variable+deuda (incluida categoría inactiva), no ingreso ni ahorro', () => {
  const p = panel();
  assert.equal(p.gastado, 30000 + 55000 + 3000 + 20000 + 45000);
  assert.equal(p.ingresos, 1000000);
  assert.equal(p.ahorro, 50000);
});

test('panel: depositar = presupuesto de gastos + colchón del mes; disponible y por día', () => {
  const p = panel();
  assert.equal(p.depositar, 25000 + 50000 + 45000 + 100000);
  assert.equal(p.disponible, 220000 - 153000);
  assert.equal(p.diasMes, 30);
  assert.equal(p.diasRestantes, 17);
  assert.equal(p.porDia, Math.floor(67000 / 17));
  assert.equal(p.sinPresupuesto, false);
});

test('panel: sin _colchon del mes usa colchonDefault', () => {
  const pres = Object.assign({}, F.presNov); delete pres._colchon;
  assert.equal(panel({ presupuesto: pres }).depositar, 120000 + 250000);
});

test('panel: días restantes 0 en mes pasado y completo en mes futuro', () => {
  assert.equal(panel({ mes: 10 }).diasRestantes, 0);
  assert.equal(panel({ mes: 10 }).porDia, 0);
  assert.equal(panel({ mes: 12 }).diasRestantes, 31);
});

test('panel: mes sin presupuesto de gastos marca sinPresupuesto', () => {
  const p = panel({ presupuesto: {} });
  assert.equal(p.sinPresupuesto, true);
  assert.equal(p.depositar, 250000);
});

test('panel: sobres por sección con estado y orden pasado → ok → sin', () => {
  const s = panel().sobres;
  assert.deepEqual(s.map(x => [x.seccion, x.estado]), [
    ['Gastos Fijos', 'pasado'],
    ['Deudas', 'ok'],
    ['Transporte', 'ok'],
    ['Comida', 'sin'],
  ]);
  const comida = s.find(x => x.seccion === 'Comida');
  assert.equal(comida.real, 58000);
  assert.deepEqual(comida.categorias.map(c => [c.id, c.real, c.pres]), [['sup', 55000, 0], ['caf', 3000, 0]]);
});

test('panel: mover un movimiento de noviembre a diciembre cambia ambos meses', () => {
  const movs = F.movimientos.map(m => m.id === 'm7' ? Object.assign({}, m, { fecha: F.d(12, 1) }) : m);
  assert.equal(panel({ movimientos: movs }).gastado, 133000);
  assert.equal(panel({ movimientos: movs, mes: 12, presupuesto: {} }).gastado, 20000);
});

test('historial: 12 meses con gastado y depositar', () => {
  const h = plano(g.calcularHistorial_({
    categorias: F.categorias, movimientos: F.movimientos, presupuestosPorMes: { 11: F.presNov },
    colchonDefault: 250000, anio: 2026,
  }));
  assert.equal(h.length, 12);
  assert.deepEqual(h[10], { mes: 11, gastado: 153000, depositar: 220000, disponible: 67000 });
  assert.deepEqual(h[9], { mes: 10, gastado: 99000, depositar: 250000, disponible: 151000 });
});

test('matrizMes_: suma movimientos del mismo día y total por categoría', () => {
  const m = plano(g.matrizMes_({ categorias: F.categorias, movimientos: F.movimientos, anio: 2026, mes: 11 }));
  const sup = m.filas.find(f => f.categoria_id === 'sup');
  assert.equal(sup.dias.length, 31);
  assert.equal(sup.dias[5], 55000);
  assert.equal(sup.total, 55000);
  assert.equal(m.filas.length, F.categorias.length);
});

test('calculos.js (el que usa el teléfono) es idéntico a Calculos.gs', () => {
  const fs = require('fs'), path = require('path');
  const raiz = path.join(__dirname, '..');
  assert.equal(fs.readFileSync(path.join(raiz, 'calculos.js'), 'utf8'), fs.readFileSync(path.join(raiz, 'apps-script', 'Calculos.gs'), 'utf8'),
    'Copia apps-script/Calculos.gs a calculos.js');
});
