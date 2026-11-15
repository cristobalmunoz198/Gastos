/**
 * Calculos.gs — funciones puras: solo usan sus argumentos (fáciles de probar).
 *
 * Definiciones (las mismas de tu planilla):
 *   Gastado          = real de categorías fijo + variable + deuda
 *   Total a depositar = presupuesto de esas categorías + colchón del mes
 *   Disponible       = Total a depositar − Gastado
 */

const TIPOS_GASTO = ['fijo', 'variable', 'deuda'];

function esGasto_(tipo) {
  return TIPOS_GASTO.indexOf(tipo) > -1;
}

/** Suma de montos por categoría para un año/mes */
function realPorCategoria_(movimientos, anio, mes) {
  const out = {};
  movimientos.forEach(m => {
    const f = m.fecha instanceof Date ? m.fecha : new Date(m.fecha);
    if (f.getFullYear() !== anio || f.getMonth() + 1 !== mes) return;
    out[m.categoria_id] = (out[m.categoria_id] || 0) + Number(m.monto);
  });
  return out;
}

/** Total a depositar y si hay presupuesto de gastos */
function depositar_(categorias, presupuesto, colchonDefault) {
  let presGasto = 0;
  categorias.forEach(c => { if (esGasto_(c.tipo)) presGasto += Number(presupuesto[c.id]) || 0; });
  const colchon = presupuesto._colchon !== undefined ? Number(presupuesto._colchon) : Number(colchonDefault);
  return { depositar: presGasto + colchon, sinPresupuesto: presGasto === 0, colchon };
}

function diasRestantes_(anio, mes, hoy) {
  const diasMes = new Date(anio, mes, 0).getDate();
  const clave = anio * 12 + mes, claveHoy = hoy.getFullYear() * 12 + hoy.getMonth() + 1;
  if (clave < claveHoy) return { diasMes, diasRestantes: 0 };
  if (clave > claveHoy) return { diasMes, diasRestantes: diasMes };
  return { diasMes, diasRestantes: diasMes - hoy.getDate() + 1 };
}

function calcularPanel_(a) {
  const real = realPorCategoria_(a.movimientos, a.anio, a.mes);
  const pres = a.presupuesto || {};
  const dep = depositar_(a.categorias, pres, a.colchonDefault);
  const dias = diasRestantes_(a.anio, a.mes, a.hoy);

  let gastado = 0, ingresos = 0, ahorro = 0;
  const porSeccion = {}, ordenSecciones = [];
  a.categorias.forEach(c => {
    const r = real[c.id] || 0;
    if (c.tipo === 'ingreso') ingresos += r;
    if (c.tipo === 'ahorro') ahorro += r;
    if (!esGasto_(c.tipo)) return;
    gastado += r;
    if (!porSeccion[c.seccion]) { porSeccion[c.seccion] = { seccion: c.seccion, tipo: c.tipo, real: 0, pres: 0, categorias: [] }; ordenSecciones.push(c.seccion); }
    const p = Number(pres[c.id]) || 0;
    const s = porSeccion[c.seccion];
    s.real += r; s.pres += p;
    if (r || p) s.categorias.push({ id: c.id, nombre: c.nombre, real: r, pres: p });
  });

  const rango = { pasado: 0, ok: 1, sin: 2 };
  const sobres = ordenSecciones.map(n => porSeccion[n])
    .filter(s => s.real > 0 || s.pres > 0)
    .map(s => Object.assign(s, { estado: s.pres === 0 ? 'sin' : (s.real > s.pres ? 'pasado' : 'ok') }))
    .sort((x, y) => (rango[x.estado] - rango[y.estado]) || (y.real - x.real));
  sobres.forEach(s => s.categorias.sort((x, y) => y.real - x.real));

  const disponible = dep.depositar - gastado;
  return {
    anio: a.anio, mes: a.mes, gastado, depositar: dep.depositar, colchon: dep.colchon, disponible,
    porDia: dias.diasRestantes > 0 ? Math.max(0, Math.floor(disponible / dias.diasRestantes)) : 0,
    diasMes: dias.diasMes, diasRestantes: dias.diasRestantes,
    ingresos, ahorro, sinPresupuesto: dep.sinPresupuesto, sobres,
  };
}

function calcularHistorial_(a) {
  const out = [];
  for (let mes = 1; mes <= 12; mes++) {
    const real = realPorCategoria_(a.movimientos, a.anio, mes);
    let gastado = 0;
    a.categorias.forEach(c => { if (esGasto_(c.tipo)) gastado += real[c.id] || 0; });
    const dep = depositar_(a.categorias, (a.presupuestosPorMes || {})[mes] || {}, a.colchonDefault);
    out.push({ mes, gastado, depositar: dep.depositar, disponible: dep.depositar - gastado });
  }
  return out;
}

/** Matriz categoría × día (31 columnas) para las pestañas de mes */
function matrizMes_(a) {
  const idx = {};
  const filas = a.categorias.map((c, i) => { idx[c.id] = i; return { categoria_id: c.id, dias: new Array(31).fill(0), total: 0 }; });
  a.movimientos.forEach(m => {
    const f = m.fecha instanceof Date ? m.fecha : new Date(m.fecha);
    if (f.getFullYear() !== a.anio || f.getMonth() + 1 !== a.mes || !(m.categoria_id in idx)) return;
    const fila = filas[idx[m.categoria_id]];
    fila.dias[f.getDate() - 1] += Number(m.monto);
    fila.total += Number(m.monto);
  });
  return { filas };
}

/* ───────── Tendencias ───────── */

/**
 * Compara lo gastado este mes (hasta hoy) con lo que llevabas al mismo día
 * en los N meses anteriores que tienen datos. Devuelve los cambios notorios.
 */
function compararCategorias_(a) {
  const N = a.meses || 3, MIN_CAMBIO = 25, MIN_MONTO = 5000;
  const esActual = a.anio === a.hoy.getFullYear() && a.mes === a.hoy.getMonth() + 1;
  const diaCorte = esActual ? a.hoy.getDate() : 31;
  const gastoIds = {};
  a.categorias.forEach(c => { if (esGasto_(c.tipo)) gastoIds[c.id] = c; });

  // Sumas por mes (clave anio*12+mes) y categoría, solo hasta el día de corte
  const porMes = {}, conDatos = {};
  a.movimientos.forEach(m => {
    if (!gastoIds[m.categoria_id]) return;
    const f = m.fecha instanceof Date ? m.fecha : new Date(m.fecha);
    const k = f.getFullYear() * 12 + f.getMonth();
    conDatos[k] = true;
    if (f.getDate() > diaCorte) return;
    porMes[k] = porMes[k] || {};
    porMes[k][m.categoria_id] = (porMes[k][m.categoria_id] || 0) + Number(m.monto);
  });

  const kActual = a.anio * 12 + a.mes - 1;
  const previos = [];
  for (let k = kActual - 1; k >= kActual - N; k--) if (conDatos[k]) previos.push(k);
  if (!previos.length) return { base: 0, diaCorte: diaCorte, items: [] };

  const items = [];
  Object.keys(gastoIds).forEach(id => {
    const actual = (porMes[kActual] || {})[id] || 0;
    const promedio = Math.round(previos.reduce((s, k) => s + ((porMes[k] || {})[id] || 0), 0) / previos.length);
    if (!promedio || Math.max(actual, promedio) < MIN_MONTO) return;
    const cambio = Math.round((actual - promedio) / promedio * 100);
    if (Math.abs(cambio) < MIN_CAMBIO) return;
    const c = gastoIds[id];
    items.push({ id: id, nombre: c.nombre, seccion: c.seccion, actual: actual, promedio: promedio, cambio: cambio });
  });
  items.sort((x, y) => Math.abs(y.actual - y.promedio) - Math.abs(x.actual - x.promedio));
  return { base: previos.length, diaCorte: diaCorte, items: items.slice(0, 3) };
}

/** A este ritmo, ¿cuánto gastarás en el mes? (solo mes en curso, desde el día 3).
 *  Los fijos/deudas ya pagados (a.fijos) no se estiran: solo se proyecta lo variable. */
function proyeccionMes_(a) {
  const esActual = a.anio === a.hoy.getFullYear() && a.mes === a.hoy.getMonth() + 1;
  const dia = a.hoy.getDate();
  if (!esActual || dia < 3) return null;
  const diasMes = new Date(a.anio, a.mes, 0).getDate();
  const fijos = Number(a.fijos) || 0;
  const proyectado = Math.round(fijos + (a.gastado - fijos) / dia * diasMes);
  return { proyectado: proyectado, diferencia: a.depositar - proyectado };
}

/* ───────── Metas de ahorro ───────── */

/**
 * Progreso de una meta: inicial + lo ahorrado en sus categorías desde "desde".
 * acumuladoAntes = lo de años anteriores (lo calcula el servidor); movimientos = año en curso.
 */
function progresoMeta_(a) {
  const meta = a.meta, cats = meta.categorias || [];
  const desde = meta.desde ? new Date(Number(meta.desde.slice(0, 4)), Number(meta.desde.slice(5, 7)) - 1, Number(meta.desde.slice(8, 10))) : new Date(0);
  let suma = 0;
  a.movimientos.forEach(m => {
    const f = m.fecha instanceof Date ? m.fecha : new Date(m.fecha);
    if (cats.indexOf(m.categoria_id) > -1 && f >= desde) suma += Number(m.monto);
  });
  const objetivo = Number(meta.objetivo) || 0;
  const actual = (Number(meta.inicial) || 0) + (Number(a.acumuladoAntes) || 0) + suma;
  const faltante = Math.max(0, objetivo - actual);
  let mesesRestantes = null, sugeridoMensual = null;
  if (meta.fecha_limite) {
    const fl = meta.fecha_limite;
    const kFin = Number(fl.slice(0, 4)) * 12 + Number(fl.slice(5, 7)) - 1;
    const kHoy = a.hoy.getFullYear() * 12 + a.hoy.getMonth();
    mesesRestantes = Math.max(1, kFin - kHoy + 1);
    sugeridoMensual = faltante ? Math.ceil(faltante / mesesRestantes) : 0;
  }
  return {
    actual: actual, faltante: faltante,
    pct: objetivo ? Math.min(100, Math.round(actual / objetivo * 100)) : 0,
    mesesRestantes: mesesRestantes, sugeridoMensual: sugeridoMensual,
  };
}
