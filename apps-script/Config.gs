/**
 * Config.gs — acceso a la planilla y ajustes.
 *
 * La clave (TOKEN) y el ID de la planilla (SHEET_ID) NO van en el código (el repo es público):
 * se guardan en Configuración del proyecto → Propiedades del script.
 */

const TZ = 'America/Santiago';

const HOJAS = {
  MOV: 'Movimientos',
  CAT: 'Categorías',
  PRES: 'Presupuesto',
  CONF: 'Config',
  METAS: 'Metas',
};

const ENCABEZADOS = {
  'Movimientos': ['id', 'fecha', 'categoria_id', 'monto', 'nota', 'origen', 'creado', 'editado'],
  'Categorías': ['id', 'seccion', 'nombre', 'tipo', 'orden', 'activa'],
  'Presupuesto': ['anio', 'mes', 'categoria_id', 'monto'],
  'Config': ['clave', 'valor'],
  'Metas': ['id', 'nombre', 'objetivo', 'inicial', 'desde', 'fecha_limite', 'categorias', 'activa'],
};

const CONFIG_INICIAL = { colchon_default: 250000 };

function prop_(k) {
  return PropertiesService.getScriptProperties().getProperty(k);
}

let SS_CACHE_ = null;
function getSS_() {
  if (SS_CACHE_) return SS_CACHE_;
  const id = prop_('SHEET_ID');
  SS_CACHE_ = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
  return SS_CACHE_;
}

/** Fecha de hoy (las pruebas pueden fijarla) */
function hoy_() {
  return (typeof __HOY__ === 'function') ? __HOY__() : new Date();
}

function getConfig_(clave) {
  const fila = leerTabla_(HOJAS.CONF).find(r => r.clave === clave);
  return fila ? fila.valor : (clave in CONFIG_INICIAL ? CONFIG_INICIAL[clave] : null);
}

function setConfig_(clave, valor) {
  invalidar_(HOJAS.CONF);
  const sh = hojaDatos_(HOJAS.CONF);
  const vals = sh.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (vals[i][0] === clave) { sh.getRange(i + 1, 2).setValue(valor); return; }
  }
  sh.appendRow([clave, valor]);
}
