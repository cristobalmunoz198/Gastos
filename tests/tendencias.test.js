'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGas } = require('./load-gas');

const g = loadGas();
const plano = x => JSON.parse(JSON.stringify(x));
const cats = [
  { id: 'res', seccion: 'Comida', nombre: 'Restaurantes', tipo: 'variable', orden: 1, activa: true },
  { id: 'sup', seccion: 'Comida', nombre: 'Supermercado', tipo: 'variable', orden: 2, activa: true },
  { id: 'caf', seccion: 'Comida', nombre: 'Café', tipo: 'variable', orden: 3, activa: true },
  { id: 'bar', seccion: 'Comida', nombre: 'Bar', tipo: 'variable', orden: 4, activa: true },
  { id: 'sue', seccion: 'Ingresos', nombre: 'Sueldos', tipo: 'ingreso', orden: 5, activa: true },
  { id: 'fon', seccion: 'Inversiones y Ahorro', nombre: 'Fondo', tipo: 'ahorro', orden: 6, activa: true },
];
const d = (m, dia, y = 2026) => new Date(y, m - 1, dia);
let n = 0;
const mv = (cat, m, dia, monto, y) => ({ id: 'x' + (++n), categoria_id: cat, fecha: d(m, dia, y), monto });
const movs = [];
[8, 9, 10].forEach(m => {
  movs.push(mv('res', m, 5, 10000), mv('res', m, 20, 30000), mv('sup', m, 2, 40000), mv('caf', m, 10, 6000), mv('bar', m, 3, 2000), mv('sue', m, 1, 999999));
});
movs.push(mv('res', 11, 3, 25000), mv('sup', 11, 2, 38000), mv('bar', 11, 4, 4000));
const comparar = extra => plano(g.compararCategorias_(Object.assign({ categorias: cats, movimientos: movs, anio: 2026, mes: 11, hoy: d(11, 14), meses: 3 }, extra)));

test('comparar: mes en curso vs lo que llevabas al mismo día en los 3 meses anteriores', () => {
  const r = comparar();
  assert.equal(r.base, 3);
  assert.equal(r.diaCorte, 14);
  assert.deepEqual(r.items.map(i => [i.nombre, i.actual, i.promedio, i.cambio]), [
    ['Restaurantes', 25000, 10000, 150],
    ['Café', 0, 6000, -100],
  ]);
});

test('comparar: ignora cambios chicos (<25%) y montos chicos (<$5.000), ingresos y ahorro', () => {
  const nombres = comparar().items.map(i => i.nombre);
  assert.ok(!nombres.includes('Supermercado'));
  assert.ok(!nombres.includes('Bar'));
  assert.ok(!nombres.includes('Sueldos'));
});

test('comparar: un mes pasado se compara completo', () => {
  const r = comparar({ mes: 10, hoy: d(11, 14) });
  assert.equal(r.diaCorte, 31);
  assert.equal(r.base, 2);              // solo agosto y septiembre tienen datos antes de octubre
  assert.deepEqual(r.items, []);         // octubre igual a su promedio
});

test('comparar: sin meses anteriores con datos no compara', () => {
  const r = comparar({ movimientos: movs.filter(m => m.fecha.getMonth() === 10) });
  assert.equal(r.base, 0);
  assert.deepEqual(r.items, []);
});

test('comparar: cruza de año (enero mira octubre–diciembre del año anterior)', () => {
  const m2 = [mv('res', 10, 5, 10000, 2025), mv('res', 11, 5, 10000, 2025), mv('res', 12, 5, 10000, 2025), mv('res', 1, 5, 20000, 2026)];
  const r = comparar({ movimientos: m2, mes: 1, hoy: d(1, 20) });
  assert.equal(r.base, 3);
  assert.deepEqual(r.items.map(i => [i.nombre, i.cambio]), [['Restaurantes', 100]]);
});

test('proyección: a este ritmo terminas el mes en…', () => {
  const p = plano(g.proyeccionMes_({ gastado: 140000, depositar: 250000, anio: 2026, mes: 11, hoy: d(11, 14) }));
  assert.deepEqual(p, { proyectado: 300000, diferencia: -50000 });
  assert.equal(g.proyeccionMes_({ gastado: 1, depositar: 1, anio: 2026, mes: 11, hoy: d(11, 2) }), null);   // muy pronto
  assert.equal(g.proyeccionMes_({ gastado: 1, depositar: 1, anio: 2026, mes: 10, hoy: d(11, 14) }), null);  // mes cerrado
});

test('meta: progreso, faltante y aporte mensual sugerido', () => {
  const meta = { id: 'm', nombre: 'Viaje', objetivo: 1000000, inicial: 100000, desde: '2026-09-01', fecha_limite: '2027-03-31', categorias: ['fon'] };
  const mm = [mv('fon', 8, 1, 50000), mv('fon', 9, 1, 50000), mv('fon', 10, 1, 50000), mv('fon', 11, 1, 50000), mv('sup', 11, 1, 50000)];
  const p = plano(g.progresoMeta_({ meta, acumuladoAntes: 0, movimientos: mm, hoy: d(11, 14) }));
  assert.equal(p.actual, 100000 + 150000);     // agosto queda fuera (antes de "desde")
  assert.equal(p.pct, 25);
  assert.equal(p.faltante, 750000);
  assert.equal(p.mesesRestantes, 5);            // dic, ene, feb, mar + lo que queda de nov
  assert.equal(p.sugeridoMensual, 150000);
});

test('meta: suma lo de años anteriores, sin fecha límite no sugiere, y no pasa de 100%', () => {
  const meta = { objetivo: 100000, inicial: 0, desde: '2025-01-01', fecha_limite: '', categorias: ['fon'] };
  const p = plano(g.progresoMeta_({ meta, acumuladoAntes: 80000, movimientos: [mv('fon', 1, 2, 50000)], hoy: d(1, 10) }));
  assert.equal(p.actual, 130000);
  assert.equal(p.pct, 100);
  assert.equal(p.faltante, 0);
  assert.equal(p.sugeridoMensual, null);
});

test('proyección: los fijos y deudas no se estiran, solo los variables', () => {
  // día 14 de 30: gastado 140.000 de los cuales 70.000 son fijos ya pagados
  const p = plano(g.proyeccionMes_({ gastado: 140000, fijos: 70000, depositar: 250000, anio: 2026, mes: 11, hoy: d(11, 14) }));
  assert.deepEqual(p, { proyectado: 70000 + 150000, diferencia: 250000 - 220000 });
});
