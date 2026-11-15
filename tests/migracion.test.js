'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGas } = require('./load-gas');
const F = require('./fixtures');

const plano = x => JSON.parse(JSON.stringify(x));
const nueva = () => loadGas({ hojas: F.planillaAntigua() });

test('parsearCelda_: sumas, restas, otras fórmulas, números y vacíos', () => {
  const g = loadGas();
  assert.deepEqual(plano(g.parsearCelda_('=6000+8330+1720', 16050)), [6000, 8330, 1720]);
  assert.deepEqual(plano(g.parsearCelda_('=1000-200', 800)), [1000, -200]);
  assert.deepEqual(plano(g.parsearCelda_('=15000*4', 60000)), [60000]);
  assert.deepEqual(plano(g.parsearCelda_('', -20000)), [-20000]);
  assert.deepEqual(plano(g.parsearCelda_('', '')), []);
  assert.deepEqual(plano(g.parsearCelda_('', 0)), []);
});

test('migrar2026: categorías por fila con nombre del mes más reciente y tipo por sección', () => {
  const g = nueva();
  g.migrar2026();
  const cats = plano(g.listarCategorias_());
  assert.deepEqual(cats.map(c => [c.seccion, c.nombre, c.tipo]), [
    ['Ingresos', 'Sueldos', 'ingreso'],
    ['Inversiones y Ahorro', 'Ahorro Liquido (BC)', 'ahorro'],
    ['Gastos Fijos', 'Luz', 'fijo'],
    ['Comida', 'Supermercado', 'variable'],
    ['Comida', 'Otros', 'variable'],
    ['Ocio y Aprendizaje', 'Claude', 'variable'],
    ['Deudas', 'CAE', 'deuda'],
  ]);
});

test('migrar2026: un movimiento por término, con fecha del día y origen migracion', () => {
  const g = nueva();
  g.mock.hoja('Noviembre').notas['15,7'] = '07/11 12:30 · $8.330 · pan';   // Supermercado día 6 (columna G)
  g.migrar2026();
  const cats = plano(g.listarCategorias_());
  const id = n => cats.find(c => c.nombre === n).id;
  const nov = g.listarMovimientos_(2026, 11);
  const sup = nov.filter(m => m.categoria_id === id('Supermercado')).map(m => [m.fecha.getDate(), m.monto, m.nota]);
  assert.deepEqual(plano(sup), [[6, 6000, ''], [6, 8330, 'pan'], [6, 1720, ''], [7, 1000, ''], [7, -200, '']]);
  assert.deepEqual(plano(nov.filter(m => m.categoria_id === id('Luz')).map(m => m.monto)), [30000]);
  assert.deepEqual(plano(nov.filter(m => m.categoria_id === id('Ahorro Liquido (BC)')).map(m => m.monto)), [500000, -20000]);
  assert.ok(nov.every(m => m.origen === 'migracion'));
  assert.equal(g.listarMovimientos_(2026, 10).length, 6);   // 1 sueldo + 2+1 súper + 1 IA + 1 CAE
});

test('migrar2026: presupuesto por mes desde el Resumen y colchón desde "Total a depositar"', () => {
  const g = nueva();
  g.migrar2026();
  const cats = plano(g.listarCategorias_());
  const id = n => cats.find(c => c.nombre === n).id;
  const p = plano(g.leerPresupuesto_(2026, 11));
  assert.equal(p[id('Luz')], 25000);
  assert.equal(p[id('Claude')], 23000);
  assert.equal(p[id('CAE')], 43000);
  assert.equal(p._colchon, 250000);
  assert.equal(p[id('Supermercado')], undefined);
  assert.equal(plano(g.leerPresupuesto_(2026, 10))[id('Claude')], 20000);
});

test('migrar2026: hace respaldo, verifica sin diferencias y no se puede correr dos veces', () => {
  const g = nueva();
  const r = plano(g.migrar2026());
  assert.equal(r.diferencias.length, 0);
  assert.equal(g.mock.copias.length, 1);
  assert.match(g.mock.copias[0].nombre, /respaldo/);
  assert.throws(() => g.migrar2026(), /ya se migró/i);
});

test('migrar2026: si una celda no cuadra, informa la diferencia y no escribe nada', () => {
  const g = nueva();
  g.mock.hoja('Noviembre').v[14][6] = 99999;   // la fórmula dice 16050 pero el valor mostrado es otro
  const r = plano(g.migrar2026());
  assert.equal(r.diferencias.length, 1);
  assert.deepEqual(r.diferencias[0], { mes: 'Noviembre', categoria: 'Supermercado', esperado: 99999 + 800, obtenido: 16050 + 800 });
  assert.equal(g.mock.hoja('Movimientos'), undefined);
});

test('migrar2026({simular:true}) informa pero no escribe ni respalda', () => {
  const g = nueva();
  const r = plano(g.migrar2026({ simular: true }));
  assert.equal(r.diferencias.length, 0);
  assert.ok(r.movimientos > 0);
  assert.equal(g.mock.copias.length, 0);
  assert.equal(g.mock.hoja('Movimientos'), undefined);
});

test('migrar2026: un monto en el día 31 de un mes de 30 días queda en el último día del mismo mes', () => {
  const g = nueva();
  g.mock.hoja('Noviembre').v[14][31] = 7000;   // Supermercado, columna del día 31 (noviembre tiene 30)
  g.migrar2026();
  const nov = g.listarMovimientos_(2026, 11).filter(m => m.monto === 7000);
  assert.equal(nov.length, 1);
  assert.equal(nov[0].fecha.getDate(), 30);
  assert.match(nov[0].nota, /día 31/);
  assert.equal(g.listarMovimientos_(2026, 12).length, 0);
});

test('atajos para el editor: simularMigracion no escribe; migrar sí', () => {
  const g = nueva();
  const r = plano(g.simularMigracion());
  assert.equal(r.diferencias.length, 0);
  assert.equal(g.mock.hoja('Movimientos'), undefined);
  g.migrar();
  assert.ok(g.listarMovimientos_(2026, 11).length > 0);
});

test('revisión: no se puede migrar si Categorías ya tiene datos (evita duplicar)', () => {
  const g = nueva();
  g.migrar2026();
  g.mock.ss.getSheetByName('Movimientos').deleteRows(2, 999);   // "vaciar Movimientos" como decía la guía
  assert.throws(() => g.migrar2026(), /ya se migró/i);
});

test('revisión: categorías con el mismo nombre en una sección se numeran ("Otros (2)")', () => {
  const g = nueva();
  g.mock.hoja('Noviembre').v[14][0] = 'Otros';   // Supermercado pasa a llamarse "Otros" en el mes más reciente
  g.migrar2026();
  const comida = plano(g.listarCategorias_()).filter(c => c.seccion === 'Comida').map(c => c.nombre);
  assert.deepEqual(comida, ['Otros', 'Otros (2)']);
});
