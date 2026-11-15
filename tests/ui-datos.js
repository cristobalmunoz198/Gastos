// Genera respuestas de la API (con datos inventados) para las pruebas de la interfaz
'use strict';
const { loadGas } = require('./load-gas');
const F = require('./fixtures');

const g = loadGas({ props: { TOKEN: 't' }, hoy: new Date(2026, 10, 14, 12) });
g.asegurarTablas_();
F.categorias.forEach(c => g.agregarFila_('Categorías', c));
F.movimientos.forEach(m => g.agregarFila_('Movimientos', Object.assign({ nota: m.id === 'm4' ? 'feria' : '', origen: 'app', creado: new Date(), editado: '' }, m)));
g.guardarPresupuesto_(2026, 11, F.presNov);
g.setConfig_('anio_visible', 2026);
g.doPost({ postData: { contents: JSON.stringify({ token: 't', accion: 'guardarMeta', id: 'meta0001', nombre: 'Viaje', objetivo: 1000000, inicial: 100000, desde: '2026-09-01', fecha_limite: '2027-03-31', categorias: ['fin'] }) } });
const get = p => JSON.parse(g.doGet({ parameter: Object.assign({ token: 't' }, p) })._contenido);

const out = {
  datos: get({ accion: 'datos', anio: 2026 }),
  inicio: get({ accion: 'inicio', anio: 2026, mes: 11 }),
  inicioSinPres: get({ accion: 'inicio', anio: 2026, mes: 9 }),
  movimientos: get({ accion: 'movimientos', anio: 2026, mes: 11 }),
  presupuesto: get({ accion: 'presupuesto', anio: 2026, mes: 11 }),
  historial: get({ accion: 'historial', anio: 2026 }),
};
process.stdout.write(JSON.stringify(out));
