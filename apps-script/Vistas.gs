/**
 * Vistas.gs — dibuja "Resumen" y "Enero…Diciembre" como siempre, a partir de las tablas.
 * Las vistas se reescriben completas (valores, no fórmulas): no escribas en ellas a mano;
 * para corregir, edita la pestaña Movimientos (o usa la app).
 */

const MESES_VISTA = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const ORDEN_TIPOS = ['ingreso', 'ahorro', 'fijo', 'variable', 'deuda'];
const FORMATO_PESOS = '$#,##0;-$#,##0;""';

/**
 * Filas de la vista: [{tipo:'seccion'|'item'|'super'|'blanco', label, ids:[categoria_id]}]
 * Orden: Ingresos · Ahorro · Fijos · "Gastos Variables" + cada sección variable · Deudas
 */
function filasVista_(categorias, conDatos) {
  const out = [];
  ORDEN_TIPOS.forEach(tipo => {
    const cats = categorias.filter(c => c.tipo === tipo && (c.activa || conDatos[c.id]));
    if (!cats.length) return;
    const secciones = [];
    cats.forEach(c => { if (secciones.indexOf(c.seccion) < 0) secciones.push(c.seccion); });
    if (tipo === 'variable') {
      out.push({ tipo: 'super', label: 'Gastos Variables', ids: cats.map(c => c.id) });
      out.push({ tipo: 'blanco' });
    }
    secciones.forEach(sec => {
      const deSec = cats.filter(c => c.seccion === sec);
      out.push({ tipo: 'seccion', label: sec, ids: deSec.map(c => c.id) });
      deSec.forEach(c => out.push({ tipo: 'item', label: c.nombre, ids: [c.id] }));
      out.push({ tipo: 'blanco' });
    });
  });
  return out;
}

function datosAnio_(anio) {
  const categorias = listarCategorias_();
  const movimientos = listarMovimientos_(anio);
  const pres = {};
  for (let m = 1; m <= 12; m++) pres[m] = leerPresupuesto_(anio, m);
  const conDatos = {};
  movimientos.forEach(m => { conDatos[m.categoria_id] = true; });
  Object.keys(pres).forEach(m => Object.keys(pres[m]).forEach(k => { conDatos[k] = true; }));
  return { categorias, movimientos, pres, conDatos, colchonDefault: Number(getConfig_('colchon_default')) || 0 };
}

/** Obtiene (o crea) una pestaña de vista, la deja en su posición y vacía */
function hojaVista_(nombre, posicion) {
  const ss = getSS_();
  let sh = ss.getSheetByName(nombre);
  if (!sh) sh = ss.insertSheet(nombre, posicion - 1);
  else { ss.setActiveSheet(sh); ss.moveActiveSheet(posicion); }
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();   // la planilla antigua tenía celdas combinadas
  sh.clear();
  return sh;
}

function escribirMatriz_(sh, matriz) {
  const ancho = Math.max.apply(null, matriz.map(r => r.length));
  const m = matriz.map(r => r.concat(new Array(ancho - r.length).fill('')));
  sh.getRange(1, 1, m.length, ancho).setValues(m);
  return { filas: m.length, ancho: ancho };
}

function renderizarResumen_(anio, D) {
  const filas = filasVista_(D.categorias, D.conDatos);
  const real = {};
  for (let m = 1; m <= 12; m++) real[m] = realPorCategoria_(D.movimientos, anio, m);
  const tipoDe = {};
  D.categorias.forEach(c => { tipoDe[c.id] = c.tipo; });
  const suma = (mapa, ids) => ids.reduce((a, id) => a + (Number(mapa[id]) || 0), 0);
  const idsTipo = t => D.categorias.filter(c => c.tipo === t).map(c => c.id);

  const M = [];
  M.push(['Año', anio]);
  const enc = [''], sub = [''];
  MESES_VISTA.forEach(n => { enc.push(n, ''); sub.push('Presupuesto', 'Real'); });
  enc.push('Total Año', ''); sub.push('Presupuesto', 'Real');
  M.push(enc, sub, ['']);

  filas.forEach(f => {
    if (f.tipo === 'blanco') { M.push(['']); return; }
    const r = [f.label];
    let tp = 0, tr = 0;
    for (let m = 1; m <= 12; m++) {
      const p = suma(D.pres[m], f.ids), x = suma(real[m], f.ids);
      tp += p; tr += x;
      r.push(p, x);
    }
    r.push(tp, tr);
    M.push(r);
  });

  // Totales (mismas filas que tu planilla de siempre)
  const tot = { flujo: ['Flujo'], gfv: ['Total Gasto Fijo y Variable'], dep: ['Total a depositar'], aho: ['Total a Ahorrar'], gas: ['Gastado'], disp: ['Disponible'] };
  const acum = { flujoP: 0, flujoR: 0, gfvP: 0, gfvR: 0, dep: 0, aho: 0, gas: 0, disp: 0 };
  const gastoIds = idsTipo('fijo').concat(idsTipo('variable'), idsTipo('deuda'));
  for (let m = 1; m <= 12; m++) {
    const ingP = suma(D.pres[m], idsTipo('ingreso')), ingR = suma(real[m], idsTipo('ingreso'));
    const ahoP = suma(D.pres[m], idsTipo('ahorro')), ahoR = suma(real[m], idsTipo('ahorro'));
    const gP = suma(D.pres[m], gastoIds), gR = suma(real[m], gastoIds);
    const dep = depositar_(D.categorias, D.pres[m], D.colchonDefault).depositar;
    tot.flujo.push(ingP - ahoP - gP, ingR - ahoR - gR);
    tot.gfv.push(gP, gR);
    tot.dep.push(dep, '');
    tot.aho.push(ingP - dep, '');
    tot.gas.push(gR, '');
    tot.disp.push(dep - gR, '');
    acum.flujoP += ingP - ahoP - gP; acum.flujoR += ingR - ahoR - gR; acum.gfvP += gP; acum.gfvR += gR;
    acum.dep += dep; acum.aho += ingP - dep; acum.gas += gR; acum.disp += dep - gR;
  }
  tot.flujo.push(acum.flujoP, acum.flujoR); tot.gfv.push(acum.gfvP, acum.gfvR);
  tot.dep.push(acum.dep, ''); tot.aho.push(acum.aho, ''); tot.gas.push(acum.gas, ''); tot.disp.push(acum.disp, '');
  M.push(tot.flujo, [''], tot.gfv, tot.dep, tot.aho, tot.gas, tot.disp);

  const sh = hojaVista_('Resumen', 1);
  const t = escribirMatriz_(sh, M);
  sh.getRange(4, 2, t.filas - 3, t.ancho - 1).setNumberFormat(FORMATO_PESOS);
  sh.getRange(1, 1, 3, t.ancho).setFontWeight('bold');
  M.forEach((r, i) => {
    const f = filas[i - 4];
    if (i >= 4 && f && f.tipo !== 'item') sh.getRange(i + 1, 1, 1, t.ancho).setFontWeight('bold');
  });
  sh.getRange(t.filas - 6, 1, 7, t.ancho).setFontWeight('bold');
  sh.setFrozenRows(3);
  sh.setFrozenColumns(1);

  // Selector de año en B1 (al cambiarlo, el disparador "alEditar" redibuja)
  const anios = aniosConDatos_(anio);
  sh.getRange(1, 2).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(anios.map(String), true).setAllowInvalid(false).build());
}

function aniosConDatos_(anioActual) {
  const s = {};
  s[anioActual] = true;
  s[hoy_().getFullYear()] = true;
  leerTabla_(HOJAS.MOV).forEach(m => { const f = m.fecha instanceof Date ? m.fecha : new Date(m.fecha); if (!isNaN(f)) s[f.getFullYear()] = true; });
  leerTabla_(HOJAS.PRES).forEach(p => { if (p.anio) s[Number(p.anio)] = true; });
  return Object.keys(s).map(Number).sort();
}

function renderizarPestanaMes_(anio, mes, D) {
  const filas = filasVista_(D.categorias, D.conDatos);
  const mat = matrizMes_({ categorias: D.categorias, movimientos: D.movimientos, anio: anio, mes: mes });
  const porId = {};
  mat.filas.forEach(f => { porId[f.categoria_id] = f; });

  const enc = ['Día'];
  for (let d = 1; d <= 31; d++) enc.push(d);
  enc.push('TOTAL');
  const M = [enc, ['']];
  filas.forEach(f => {
    if (f.tipo === 'blanco') { M.push(['']); return; }
    if (f.tipo !== 'item') { M.push([f.label]); return; }
    const x = porId[f.ids[0]];
    M.push([f.label].concat(x.dias.map(v => v || ''), [x.total || '']));
  });
  const sh = hojaVista_(MESES_VISTA[mes - 1], mes + 1);
  const t = escribirMatriz_(sh, M);
  sh.getRange(2, 2, t.filas - 1, 32).setNumberFormat(FORMATO_PESOS);
  sh.getRange(1, 1, 1, t.ancho).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);
}

/** Redibuja Resumen y los 12 meses del año */
function renderizarAnio_(anio) {
  const D = datosAnio_(anio);
  renderizarResumen_(anio, D);
  for (let m = 1; m <= 12; m++) renderizarPestanaMes_(anio, m, D);
}

/** Redibuja un mes y el Resumen, solo si ese año es el que se está mostrando */
function renderizarMes_(anio, mes) {
  if (Number(getConfig_('anio_visible')) !== Number(anio)) return;
  const D = datosAnio_(anio);
  renderizarResumen_(anio, D);
  renderizarPestanaMes_(anio, mes, D);
}
