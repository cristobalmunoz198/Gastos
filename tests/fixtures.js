'use strict';
// Datos inventados para pruebas. NUNCA poner montos reales aquí (repo público).

const categorias = [
  { id: 'sue', seccion: 'Ingresos', nombre: 'Sueldos', tipo: 'ingreso', orden: 1, activa: true },
  { id: 'fin', seccion: 'Inversiones y Ahorro', nombre: 'Fondo', tipo: 'ahorro', orden: 2, activa: true },
  { id: 'luz', seccion: 'Gastos Fijos', nombre: 'Luz', tipo: 'fijo', orden: 3, activa: true },
  { id: 'sup', seccion: 'Comida', nombre: 'Supermercado', tipo: 'variable', orden: 4, activa: true },
  { id: 'caf', seccion: 'Comida', nombre: 'Café', tipo: 'variable', orden: 5, activa: false },
  { id: 'ben', seccion: 'Transporte', nombre: 'Bencina', tipo: 'variable', orden: 6, activa: true },
  { id: 'cre', seccion: 'Deudas', nombre: 'Crédito', tipo: 'deuda', orden: 7, activa: true },
];

const d = (m, dia) => new Date(2026, m - 1, dia);
const movimientos = [
  { id: 'm1', fecha: d(11, 1), categoria_id: 'sue', monto: 1000000 },
  { id: 'm2', fecha: d(11, 2), categoria_id: 'fin', monto: 50000 },
  { id: 'm3', fecha: d(11, 5), categoria_id: 'luz', monto: 30000 },
  { id: 'm4', fecha: d(11, 6), categoria_id: 'sup', monto: 40000 },
  { id: 'm5', fecha: d(11, 6), categoria_id: 'sup', monto: 15000 },
  { id: 'm6', fecha: d(11, 7), categoria_id: 'caf', monto: 3000 },   // categoría inactiva: igual suma
  { id: 'm7', fecha: d(11, 8), categoria_id: 'ben', monto: 20000 },
  { id: 'm8', fecha: d(11, 9), categoria_id: 'cre', monto: 45000 },
  { id: 'm9', fecha: d(10, 3), categoria_id: 'sup', monto: 99000 },  // octubre
];

// Presupuesto de noviembre: luz 25.000 (se pasa), bencina 50.000 (dentro), crédito 45.000 (dentro), sup sin tope
const presNov = { sue: 1000000, fin: 50000, luz: 25000, ben: 50000, cre: 45000, _colchon: 100000 };

module.exports = { categorias, movimientos, presNov, d };

// ── Planilla antigua (formato matriz) para probar la migración ──
function filaDia(label, celdas) {            // celdas: { dia: valor|'=fórmula' }
  const r = [label];
  for (let dia = 1; dia <= 31; dia++) r.push(celdas && dia in celdas ? celdas[dia] : '');
  r.push(label ? '=SUM(B:AF)' : '');         // TOTAL (la simulación no calcula SUM; se usa solo como marca de ítem)
  return r;
}
function seccion(label) { const r = [label]; for (let i = 0; i < 32; i++) r.push(''); return r; }
const vacia = () => seccion('');

function mesAntiguo(nombreCat18, celdas) {
  const enc = ['Día']; for (let i = 1; i <= 31; i++) enc.push(i); enc.push('TOTAL');
  return [
    enc,                                                  // 1
    vacia(),                                              // 2
    seccion('Ingresos'),                                  // 3
    filaDia('Sueldos', celdas.sue),                       // 4
    vacia(),                                              // 5
    seccion('Inversiones y Ahorro'),                      // 6
    filaDia('Ahorro Liquido (BC)', celdas.aho),           // 7
    vacia(),                                              // 8
    seccion('Gastos Fijos'),                              // 9
    filaDia('Luz', celdas.luz),                           // 10
    vacia(),                                              // 11
    seccion('Gastos Variables'),                          // 12
    vacia(),                                              // 13
    seccion('Comida'),                                    // 14
    filaDia('Supermercado', celdas.sup),                  // 15
    filaDia('Otros', celdas.otr),                         // 16
    seccion('Ocio y Aprendizaje'),                        // 17
    filaDia(nombreCat18, celdas.ia),                      // 18
    vacia(),                                              // 19
    seccion('Deudas'),                                    // 20
    filaDia('CAE', celdas.cae),                           // 21
  ];
}

const octubre = mesAntiguo('ChatGPT', {
  sue: { 1: 900000 }, sup: { 3: '=1000+2000', 20: 5000 }, ia: { 4: 20000 }, cae: { 10: 40000 },
});
const noviembre = mesAntiguo('Claude', {
  sue: { 1: 1000000 },
  aho: { 1: 500000, 2: -20000 },                       // monto negativo
  luz: { 5: '=15000*2' },                               // fórmula no suma: un solo movimiento de 30000
  sup: { 6: '=6000+8330+1720', 7: '=1000-200' },        // varios términos y resta
  ia: { 4: 23000 },
  cae: { 4: 43000 },
});

function resumenAntiguo() {
  const filas = [];
  const fila = (n, arr) => { while (filas.length < n - 1) filas.push(['']); filas[n - 1] = arr; };
  fila(1, ['', 'Octubre', '', 'Noviembre', '', 'Total Año']);
  fila(2, ['', 'Presupuesto', 'Real', 'Presupuesto', 'Real', 'Presupesto', 'Real']);
  fila(4, ['Sueldos', 900000, '', 1000000, '']);
  fila(7, ['Ahorro Liquido (BC)', '', '', 400000, '']);
  fila(10, ['Luz', 25000, '', 25000, '']);
  fila(15, ['Supermercado', '', '', '', '']);
  fila(18, ['ChatGPT', 20000, '', '=11500*2', '']);
  fila(21, ['CAE', 40000, '', 43000, '']);
  fila(30, ['Total a depositar', '=B29+250000', '', '=D29+250000', '']);
  return filas;
}

function planillaAntigua() {
  return { Resumen: resumenAntiguo(), Octubre: octubre, Noviembre: noviembre };
}

module.exports.planillaAntigua = planillaAntigua;
