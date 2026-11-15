/**
 * Migracion.gs — pasa la planilla 2026 (matriz categoría × día) a las tablas nuevas.
 *
 * Uso desde el editor:
 *   1) migrar2026({simular:true})  → revisa el registro: "diferencias: 0"
 *   2) migrar2026()                → respalda, migra y redibuja las vistas
 */

const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const TIPO_POR_SECCION = { 'ingresos': 'ingreso', 'inversiones y ahorro': 'ahorro', 'gastos fijos': 'fijo', 'deudas': 'deuda' };

/** "=6000+8330+1720" → [6000, 8330, 1720]; "=1000-200" → [1000, -200]; otra fórmula → [valor] */
function parsearCelda_(formula, valor) {
  const f = String(formula || '').replace(/\s+/g, '');
  if (f && /^=-?\d+(\.\d+)?([+-]\d+(\.\d+)?)*$/.test(f)) {
    return (f.slice(1).match(/[+-]?\d+(\.\d+)?/g) || []).map(Number).filter(n => n !== 0);
  }
  const v = Number(valor);
  return (valor === '' || valor === null || !v) ? [] : [v];
}

/** Filas de ítems de una pestaña antigua: [{fila, seccion, nombre}] (ítem = tiene algo en la columna TOTAL) */
function leerEstructuraAntigua_(sh) {
  const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  const enc = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const colTotal = enc.findIndex(h => String(h).trim().toUpperCase() === 'TOTAL') + 1;
  if (!colTotal) throw new Error('"' + sh.getName() + '" no tiene columna TOTAL');
  const labels = sh.getRange(1, 1, lastRow, 1).getDisplayValues().map(r => String(r[0]).trim());
  const tot = sh.getRange(1, colTotal, lastRow, 1);
  const totF = tot.getFormulas().map(r => r[0]), totV = tot.getDisplayValues().map(r => String(r[0]).trim());
  const out = [];
  let seccion = null;
  for (let i = 1; i < lastRow; i++) {
    if (!labels[i]) continue;
    if (totF[i] === '' && totV[i] === '') { seccion = labels[i]; continue; }
    if (seccion) out.push({ fila: i + 1, seccion: seccion, nombre: labels[i] });
  }
  return { items: out, colTotal: colTotal };
}

function pestanasDeMes_(ss) {
  return ss.getSheets()
    .map(sh => ({ sh: sh, mes: NOMBRES_MES.indexOf(sh.getName().trim().toLowerCase()) + 1 }))
    .filter(x => x.mes > 0)
    .sort((a, b) => a.mes - b.mes);
}

function montoDeNota_(linea) {
  const m = String(linea).match(/\$\s*([\d.]+)/);
  return m ? Number(m[1].replace(/\./g, '')) : null;
}

function migrar2026(opciones) {
  limpiarCache_();
  const simular = !!(opciones && opciones.simular);
  const anio = (opciones && opciones.anio) || 2026;
  const ss = getSS_();

  const yaMigrado = (ss.getSheetByName(HOJAS.MOV) && leerTabla_(HOJAS.MOV).some(m => m.origen === 'migracion')) ||
    (ss.getSheetByName(HOJAS.CAT) && leerTabla_(HOJAS.CAT).length > 0);
  if (yaMigrado) throw new Error('Esta planilla ya se migró. Para repetir, abre la copia de respaldo y migra esa.');

  const meses = pestanasDeMes_(ss);
  if (!meses.length) throw new Error('No encontré pestañas de mes (Enero…Diciembre)');

  // 1) Categorías: una por fila; nombre y sección del mes más reciente que tenga esa fila
  const porFila = {};
  const estructuras = meses.map(m => {
    const e = leerEstructuraAntigua_(m.sh);
    e.items.forEach(it => { porFila[it.fila] = it; });
    return e;
  });
  const filas = Object.keys(porFila).map(Number).sort((a, b) => a - b);
  const usados = {};
  const categorias = filas.map((fila, i) => {
    const it = porFila[fila];
    // Nombres repetidos dentro de una sección ("Otros", "Otros (2)", …) para poder distinguirlos en la app
    let nombre = it.nombre, n = 1;
    while (usados[it.seccion + '|' + nombre]) nombre = it.nombre + ' (' + (++n) + ')';
    usados[it.seccion + '|' + nombre] = true;
    return { id: nuevoId_(), seccion: it.seccion, nombre: nombre, tipo: TIPO_POR_SECCION[it.seccion.toLowerCase()] || 'variable', orden: i + 1, activa: true, _fila: fila };
  });
  const catDeFila = {};
  categorias.forEach(c => { catDeFila[c._fila] = c; });

  // 2) Movimientos: un término de cada celda = un movimiento; verificación contra el valor mostrado
  const movimientos = [], diferencias = [];
  const ahora = new Date();
  meses.forEach((m, k) => {
    const colTotal = estructuras[k].colTotal;
    const nDias = colTotal - 2;
    const rango = m.sh.getRange(1, 2, m.sh.getLastRow(), nDias);
    const vals = rango.getValues(), forms = rango.getFormulas(), notas = rango.getNotes();
    estructuras[k].items.forEach(it => {
      const cat = catDeFila[it.fila];
      let esperado = 0, obtenido = 0;
      for (let j = 0; j < nDias; j++) {
        const terminos = parsearCelda_(forms[it.fila - 1][j], vals[it.fila - 1][j]);
        esperado += Number(vals[it.fila - 1][j]) || 0;
        if (!terminos.length) continue;
        const lineas = String(notas[it.fila - 1][j] || '').split('\n').filter(Boolean);
        terminos.forEach(t => {
          obtenido += t;
          const iNota = lineas.findIndex(l => montoDeNota_(l) === t);
          let nota = iNota > -1 ? String(lineas.splice(iNota, 1)[0]).split(' · ').slice(2).join(' · ') : '';
          // Un monto anotado en un día que el mes no tiene (ej. 31 de junio) queda en el último día del mes
          const ultimo = new Date(anio, m.mes, 0).getDate();
          const dia = Math.min(j + 1, ultimo);
          if (j + 1 > ultimo) nota = (nota ? nota + ' ' : '') + '(anotado el día ' + (j + 1) + ' en la planilla)';
          movimientos.push({ id: nuevoId_(), fecha: new Date(anio, m.mes - 1, dia), categoria_id: cat.id, monto: t, nota: nota, origen: 'migracion', creado: ahora, editado: '' });
        });
      }
      if (Math.round(esperado) !== Math.round(obtenido)) {
        diferencias.push({ mes: m.sh.getName(), categoria: it.nombre, esperado: esperado, obtenido: obtenido });
      }
    });
  });

  // 3) Presupuesto por mes desde el Resumen (misma fila que la categoría)
  const presupuestos = [];
  let colchonDefault = CONFIG_INICIAL.colchon_default;
  const res = ss.getSheetByName('Resumen');
  if (res) {
    const R = res.getRange(1, 1, res.getLastRow(), res.getLastColumn());
    const vals = R.getValues(), forms = R.getFormulas();
    const filaDep = vals.findIndex(r => String(r[0]).trim().toLowerCase() === 'total a depositar');
    meses.forEach(m => {
      const c = vals[0].findIndex(h => String(h).trim().toLowerCase() === NOMBRES_MES[m.mes - 1]);
      if (c < 0) return;
      categorias.forEach(cat => {
        const v = Number((vals[cat._fila - 1] || [])[c]) || 0;
        if (v) presupuestos.push([anio, m.mes, cat.id, v]);
      });
      if (filaDep > -1 && (forms[filaDep][c] || vals[filaDep][c] !== '')) {
        const mm = String(forms[filaDep][c]).match(/\+\s*(\d+)\s*$/);
        const colchon = mm ? Number(mm[1]) : CONFIG_INICIAL.colchon_default;
        colchonDefault = colchon;
        presupuestos.push([anio, m.mes, '_colchon', colchon]);
      }
    });
  }

  const resumen = { categorias: categorias.length, movimientos: movimientos.length, presupuestos: presupuestos.length, diferencias: diferencias };
  Logger.log('Migración ' + (simular ? '(simulación) ' : '') + JSON.stringify(Object.assign({}, resumen, { diferencias: diferencias.length })));
  diferencias.forEach(d => Logger.log('  Diferencia en ' + d.mes + ' › ' + d.categoria + ': planilla ' + d.esperado + ' vs migrado ' + d.obtenido));
  if (simular || diferencias.length) return resumen;

  // 4) Respaldo y escritura
  DriveApp.getFileById(ss.getId()).makeCopy('Presupuesto ' + anio + ' — respaldo antes de migrar');
  asegurarTablas_();
  escribirFilas_(HOJAS.CAT, categorias.map(c => filaDesdeObjeto_(HOJAS.CAT, c)));
  escribirFilas_(HOJAS.MOV, movimientos.map(m => filaDesdeObjeto_(HOJAS.MOV, m)));
  escribirFilas_(HOJAS.PRES, presupuestos);
  setConfig_('colchon_default', colchonDefault);
  setConfig_('anio_visible', anio);
  if (typeof renderizarAnio_ === 'function') renderizarAnio_(anio);
  return resumen;
}

/** Agrega muchas filas de una vez (mucho más rápido que appendRow en bucle) */
function escribirFilas_(nombre, filas) {
  if (!filas.length) return;
  invalidar_(nombre);
  const sh = hojaDatos_(nombre);
  sh.getRange(sh.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas);
}

/* Atajos para ejecutar desde el editor (▶ no permite pasar opciones) */
function simularMigracion() { return migrar2026({ simular: true }); }
function migrar() { return migrar2026(); }
