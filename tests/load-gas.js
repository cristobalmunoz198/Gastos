// Carga todos los archivos apps-script/*.gs en un contexto aislado con los servicios simulados
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { crearMock } = require('./gas-mock');

const DIR = path.join(__dirname, '..', 'apps-script');

function loadGas(opts = {}) {
  const mock = crearMock(opts);
  const ctx = vm.createContext(Object.assign({ console, Date, Math, JSON }, mock.globals));
  // "hoy" del script: si el código pide `hoy_()`, el test lo controla
  ctx.__HOY__ = () => new Date(mock.getHoy());
  fs.readdirSync(DIR).filter(f => f.endsWith('.gs')).sort().forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f });
  });
  ctx.mock = mock;
  return ctx;
}

module.exports = { loadGas };
