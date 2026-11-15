/**
 * AnioNuevo.gs — año nuevo automático e instalación.
 *
 * revisarAnioNuevo corre todos los días a las 3 AM (lo programa instalar()):
 *   - desde el 21 de diciembre: crea el presupuesto de los 12 meses del año siguiente
 *     copiando el de diciembre (si aún no existe).
 *   - desde el 1 de enero: la planilla pasa a mostrar el año nuevo.
 */

function revisarAnioNuevo(fecha) {
  limpiarCache_();
  const h = fecha instanceof Date ? fecha : hoy_();   // el disparador entrega un evento, no una fecha
  const anio = h.getFullYear();

  if (h.getMonth() === 11 && h.getDate() >= 21) crearPresupuestoAnio_(anio + 1, anio);

  // Si el disparador no alcanzó a correr en diciembre, igual crea el año en curso
  if (!tienePresupuestoAnio_(anio)) crearPresupuestoAnio_(anio, anio - 1);

  if ((Number(getConfig_('anio_visible')) || 0) < anio) {
    setConfig_('anio_visible', anio);
    renderizarAnio_(anio);
  }
}

function tienePresupuestoAnio_(anio) {
  return leerTabla_(HOJAS.PRES).some(r => Number(r.anio) === anio);
}

function crearPresupuestoAnio_(anioNuevo, anioBase) {
  if (tienePresupuestoAnio_(anioNuevo)) return false;
  const base = leerPresupuesto_(anioBase, 12);
  if (!Object.keys(base).length) return false;
  const filas = [];
  for (let m = 1; m <= 12; m++) Object.keys(base).forEach(k => filas.push([anioNuevo, m, k, base[k]]));
  escribirFilas_(HOJAS.PRES, filas);
  return true;
}

/** Ejecutar UNA vez desde el editor (se puede repetir sin problema). */
function instalar() {
  asegurarTablas_();
  ScriptApp.getProjectTriggers()
    .filter(t => ['revisarAnioNuevo', 'alEditar'].indexOf(t.getHandlerFunction()) > -1)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('revisarAnioNuevo').timeBased().everyDays(1).atHour(3).inTimezone(TZ).create();
  ScriptApp.newTrigger('alEditar').forSpreadsheet(getSS_()).onEdit().create();
  if (!getConfig_('anio_visible')) setConfig_('anio_visible', hoy_().getFullYear());
  Logger.log('Listo: tablas y disparadores instalados');
}
