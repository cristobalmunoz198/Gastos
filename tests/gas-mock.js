// Simulación mínima en memoria de los servicios de Apps Script usados por apps-script/*.gs
'use strict';

function crearMock(opts = {}) {
  const hojas = [];                 // [{nombre, v: [][], f: [][], notas: {}, oculta, validacion}]
  const props = Object.assign({}, opts.props || {});
  const copias = [];
  const triggers = [];
  let hoy = opts.hoy || new Date(2026, 10, 14, 12, 0, 0);
  let uid = 0;
  let activa = null;
  const lecturas = {};               // cuántas veces se leyó cada hoja con getValues

  function hoja(nombre, filas) {
    const h = { nombre, v: [], f: [], notas: {}, oculta: false, frozen: 0, formatos: [] };
    (filas || []).forEach((r, i) => r.forEach((x, j) => setCell(h, i + 1, j + 1, x)));
    return h;
  }
  function ensure(h, r, c) {
    while (h.v.length < r) { h.v.push([]); h.f.push([]); }
    for (let i = 0; i < h.v.length; i++) {
      while (h.v[i].length < c) { h.v[i].push(''); h.f[i].push(''); }
    }
  }
  function setCell(h, r, c, x) {
    ensure(h, r, c);
    if (typeof x === 'string' && x.startsWith('=')) {
      h.f[r - 1][c - 1] = x;
      h.v[r - 1][c - 1] = evalFormula(x);
    } else {
      h.f[r - 1][c - 1] = '';
      h.v[r - 1][c - 1] = x === undefined || x === null ? '' : x;
    }
  }
  function evalFormula(f) {
    const s = f.slice(1);
    if (/^[\d+\-*/.() ]+$/.test(s)) return Function('return (' + s + ')')();
    return 0;
  }
  function lastRow(h) {
    for (let i = h.v.length; i > 0; i--) if (h.v[i - 1].some(x => x !== '' && x !== null)) return i;
    return 0;
  }
  function lastCol(h) {
    let m = 0;
    h.v.forEach(r => { for (let j = r.length; j > 0; j--) if (r[j - 1] !== '' && r[j - 1] !== null) { m = Math.max(m, j); break; } });
    return m;
  }

  function Range(h, r, c, nr, nc) {
    nr = nr || 1; nc = nc || 1;
    const cell = (i, j) => ((h.v[r - 1 + i] || [])[c - 1 + j]);
    const api = {
      getRow: () => r, getColumn: () => c, getNumRows: () => nr, getNumColumns: () => nc,
      getValues: () => (lecturas[h.nombre] = (lecturas[h.nombre] || 0) + 1, null) || Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const x = cell(i, j); return x === undefined ? '' : (x instanceof Date ? new Date(x) : x); })),
      getDisplayValues: () => api.getValues().map(row => row.map(x => x instanceof Date ? x.toISOString() : String(x))),
      getFormulas: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => ((h.f[r - 1 + i] || [])[c - 1 + j]) || '')),
      getValue: () => api.getValues()[0][0],
      getFormula: () => api.getFormulas()[0][0],
      getNotes: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => h.notas[(r + i) + ',' + (c + j)] || '')),
      getNote: () => h.notas[r + ',' + c] || '',
      setNote: n => { h.notas[r + ',' + c] = n; return api; },
      setValue: x => { setCell(h, r, c, x); return api; },
      setValues: m => {
        if (m.length !== nr || m.some(row => row.length !== nc)) throw new Error('setValues: dimensiones no coinciden (' + m.length + 'x' + (m[0] || []).length + ' vs ' + nr + 'x' + nc + ')');
        m.forEach((row, i) => row.forEach((x, j) => setCell(h, r + i, c + j, x))); return api;
      },
      setFormula: x => { setCell(h, r, c, x); return api; },
      clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) setCell(h, r + i, c + j, ''); return api; },
      clear: () => api.clearContent(),
      setNumberFormat: fmt => { h.formatos.push({ r, c, nr, nc, fmt }); return api; },
      setFontWeight: () => api, setBackground: () => api, setFontColor: () => api, setHorizontalAlignment: () => api,
      breakApart: () => { h.combinada = false; return api; },
      setDataValidation: rule => { h.validacion = { r, c, rule }; return api; },
    };
    return api;
  }

  function Sheet(h) {
    const api = {
      _h: h,
      getName: () => h.nombre,
      setName: n => { h.nombre = n; return api; },
      getLastRow: () => lastRow(h),
      getLastColumn: () => lastCol(h),
      getMaxRows: () => Math.max(h.v.length, 1000),
      getMaxColumns: () => Math.max((h.v[0] || []).length, 26),
      getRange: (a, b, c, d) => {
        if (typeof a === 'string') {
          const m = a.match(/^([A-Z]+)(\d+)$/);
          const col = m[1].split('').reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0);
          return Range(h, Number(m[2]), col, 1, 1);
        }
        return Range(h, a, b, c, d);
      },
      getDataRange: () => Range(h, 1, 1, Math.max(lastRow(h), 1), Math.max(lastCol(h), 1)),
      appendRow: row => { const r = lastRow(h) + 1; row.forEach((x, j) => setCell(h, r, j + 1, x)); return api; },
      deleteRow: r => { h.v.splice(r - 1, 1); h.f.splice(r - 1, 1); return api; },
      deleteRows: (r, n) => { h.v.splice(r - 1, n); h.f.splice(r - 1, n); return api; },
      clear: () => { h.v = []; h.f = []; h.notas = {}; h.formatos = []; return api; },
      clearContents: () => api.clear(),
      setFrozenRows: n => { h.frozen = n; return api; },
      setFrozenColumns: () => api,
      hideSheet: () => { h.oculta = true; return api; },
      isSheetHidden: () => h.oculta,
      setColumnWidth: () => api, setColumnWidths: () => api, autoResizeColumns: () => api,
      getIndex: () => hojas.indexOf(h) + 1,
    };
    return api;
  }

  const ss = {
    getId: () => 'SS_TEST',
    getSheets: () => hojas.map(Sheet),
    getSheetByName: n => { const h = hojas.find(x => x.nombre === n); return h ? Sheet(h) : null; },
    insertSheet: (n, idx) => {
      if (hojas.find(x => x.nombre === n)) throw new Error('Ya existe ' + n);
      const h = hoja(n);
      if (idx === undefined || idx >= hojas.length) hojas.push(h); else hojas.splice(idx, 0, h);
      return Sheet(h);
    },
    deleteSheet: s => { const i = hojas.indexOf(s._h); if (i > -1) hojas.splice(i, 1); },
    getNumSheets: () => hojas.length,
    setActiveSheet: s => { activa = s._h; return s; },
    moveActiveSheet: pos => { const i = hojas.indexOf(activa); if (i > -1) { hojas.splice(i, 1); hojas.splice(pos - 1, 0, activa); } },
  };

  Object.keys(opts.hojas || {}).forEach(n => hojas.push(hoja(n, opts.hojas[n])));

  const pad = n => String(n).padStart(2, '0');
  const globals = {
    SpreadsheetApp: {
      openById: () => ss,
      getActive: () => ss,
      getActiveSpreadsheet: () => ss,
      flush: () => {},
      newDataValidation: () => {
        const b = { requireValueInList: () => b, setAllowInvalid: () => b, build: () => ({ tipo: 'lista' }) };
        return b;
      },
    },
    Utilities: {
      getUuid: () => 'u' + String(++uid).padStart(7, '0') + '-xxxx',
      // Zona fija: el mock trabaja en hora local del proceso (TZ=America/Santiago en npm test)
      formatDate: (d, tz, fmt) => {
        const y = d.getFullYear(), M = d.getMonth() + 1, D = d.getDate(), H = d.getHours(), m = d.getMinutes();
        return fmt.replace('yyyy', y).replace('MM', pad(M)).replace('dd', pad(D)).replace('HH', pad(H)).replace('mm', pad(m))
          .replace(/\bM\b/, M).replace(/\bd\b/, D);
      },
      sleep: () => {},
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, getProperties: () => Object.assign({}, props) }) },
    DriveApp: { getFileById: id => ({ makeCopy: nombre => { copias.push({ id, nombre }); return { getId: () => 'COPIA_' + copias.length, getName: () => nombre }; } }) },
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: t => { const i = triggers.indexOf(t); if (i > -1) triggers.splice(i, 1); },
      newTrigger: fn => {
        const t = { fn, tipo: null, getHandlerFunction: () => fn };
        const b = { timeBased: () => { t.tipo = 'tiempo'; return b; }, everyDays: () => b, after: () => b, atHour: () => b, inTimezone: () => b,
          forSpreadsheet: () => b, onEdit: () => { t.tipo = 'edicion'; return b; }, create: () => { triggers.push(t); return t; } };
        return b;
      },
    },
    ContentService: { createTextOutput: s => ({ _contenido: s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    Logger: { log: () => {} },
    Session: { getScriptTimeZone: () => 'America/Santiago' },
  };

  return {
    globals, ss, hojas, props, copias, triggers, lecturas,
    setHoy: d => { hoy = d; }, getHoy: () => hoy,
    // Ayudas para los tests
    valores: n => { const h = hojas.find(x => x.nombre === n); return h ? h.v.map(r => r.slice()) : null; },
    hoja: n => hojas.find(x => x.nombre === n),
  };
}

module.exports = { crearMock };
