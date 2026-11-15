/* Gastos — app del iPhone.
 * Versión rápida: los datos del año viven en el teléfono y todo se calcula aquí (calculos.js,
 * la misma lógica del script). Guardar es instantáneo; los cambios se envían a Google por detrás
 * con una cola que se reintenta sola si no hay señal.
 */
(function () {
  'use strict';

  /* ───────── Utilidades ───────── */
  const $ = id => document.getElementById(id);
  const LS = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
    del: k => { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const leerJSON = (k, def) => { try { const v = JSON.parse(LS.get(k) || 'null'); return v == null ? def : v; } catch (e) { return def; } };
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const GASTO = ['fijo', 'variable', 'deuda'];
  const digitos = s => String(s).replace(/\D/g, '');
  const pesos = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(Number(n) || 0)).toLocaleString('es-CL');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dos = n => String(n).padStart(2, '0');
  const fechaTxt = d => d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate());
  const aFecha = s => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));   // local, no UTC
  const claseUso = pct => pct > 100 ? 'over' : pct >= 85 ? 'warn' : '';
  const nuevoId = () => 'c' + Math.random().toString(36).slice(2, 9).padEnd(7, '0');

  let toastT;
  function toast(msg, err) {
    const t = $('toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'toast' + (err ? ' err' : ''); }, 3000);
  }

  /* ───────── Estado ───────── */
  const hoy = new Date();
  const st = {
    url: LS.get('g_url') || '', token: LS.get('g_token') || '',
    anio: hoy.getFullYear(), mes: hoy.getMonth() + 1,
    datos: {},                         // { [anio]: {anio, categorias, movimientos, presupuestos, colchonDefault} } formato API
    cola: leerJSON('g_cola', []),      // cambios aún no enviados: [{accion, body}]
    sobreAbierto: null,
    agregar: { tipo: 'gasto', seccion: '', categoria: '' },
  };

  /* ───────── API ───────── */
  function parse(txt) {
    try { return JSON.parse(txt); }
    catch (e) { throw new Error('No pude conectar. Revisa la URL y que el acceso sea "Cualquier usuario".'); }
  }
  class ErrorServidor extends Error {}
  const api = {
    get(accion, params, url, token) {
      const q = Object.assign({ formato: 'json', token: token || st.token, accion: accion }, params || {});
      const qs = Object.keys(q).map(k => k + '=' + encodeURIComponent(q[k])).join('&');
      return fetch((url || st.url) + '?' + qs).then(r => r.text()).then(parse).then(r => { if (!r.ok) throw new ErrorServidor(r.msg || 'Error'); return r; });
    },
    post(accion, body) {
      const b = Object.assign({ accion: accion, token: st.token }, body);
      return fetch(st.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(b) })
        .then(r => r.text()).then(parse).then(r => { if (!r.ok) throw new ErrorServidor(r.msg || 'Error'); return r; });
    },
  };

  /* ───────── Datos locales ───────── */
  function datos(anio) { return st.datos[anio || st.anio]; }
  function catalogo() {
    const d = datos() || Object.values(st.datos)[0];
    return d ? d.categorias : [];
  }
  function guardarLocal(anio) { if (st.datos[anio]) LS.set('g_datos_' + anio, JSON.stringify(st.datos[anio])); }
  function cargarLocal(anio) { const d = leerJSON('g_datos_' + anio, null); if (d) st.datos[anio] = d; return d; }

  /** Movimientos con fecha como Date local (lo que espera calculos.js) */
  function movsCalc(d) { return d.movimientos.map(m => Object.assign({}, m, { fecha: aFecha(m.fecha) })); }

  function panelDe(anio, mes) {
    const d = datos(anio);
    return calcularPanel_({
      categorias: d.categorias, movimientos: movsCalc(d), presupuesto: (d.presupuestos || {})[mes] || {},
      colchonDefault: d.colchonDefault, anio: anio, mes: mes, hoy: new Date(),
    });
  }

  /** Aplica un cambio sobre los datos del teléfono (lo mismo que hará el servidor) */
  function aplicarLocal(accion, b) {
    const anioDe = f => Number(String(f).slice(0, 4));
    const todos = Object.values(st.datos);
    if (accion === 'registrar') {
      const d = st.datos[anioDe(b.fecha)];
      if (d && !d.movimientos.some(m => m.id === b.id)) d.movimientos.push({ id: b.id, fecha: b.fecha, categoria_id: b.categoria_id, monto: b.monto, nota: b.nota || '', origen: 'app' });
    } else if (accion === 'editar') {
      let mov = null;
      todos.forEach(d => { const i = d.movimientos.findIndex(m => m.id === b.id); if (i > -1) mov = d.movimientos.splice(i, 1)[0]; });
      if (mov) {
        ['fecha', 'categoria_id', 'monto', 'nota'].forEach(k => { if (b[k] !== undefined) mov[k] = b[k]; });
        const d = st.datos[anioDe(mov.fecha)];
        if (d) d.movimientos.push(mov);
      }
    } else if (accion === 'borrar') {
      todos.forEach(d => { d.movimientos = d.movimientos.filter(m => m.id !== b.id); });
    } else if (accion === 'guardarPresupuesto') {
      const d = st.datos[b.anio];
      if (d) { d.presupuestos = d.presupuestos || {}; d.presupuestos[b.mes] = Object.assign({}, b.items, { _colchon: b.colchon }); }
    } else if (accion === 'copiarPresupuesto') {
      const ant = b.mes === 1 ? { anio: b.anio - 1, mes: 12 } : { anio: b.anio, mes: b.mes - 1 };
      const src = st.datos[ant.anio], d = st.datos[b.anio];
      if (src && d && src.presupuestos && src.presupuestos[ant.mes]) d.presupuestos[b.mes] = Object.assign({}, src.presupuestos[ant.mes]);
    } else if (accion === 'guardarMeta') {
      todos.forEach(d => {
        d.metas = d.metas || [];
        const i = d.metas.findIndex(m => m.id === b.id);
        const datosMeta = Object.assign({}, b); delete datosMeta.accion; delete datosMeta.token;
        if (i > -1) Object.assign(d.metas[i], datosMeta);
        else d.metas.push(Object.assign({ acumuladoAntes: 0, inicial: 0, categorias: [], activa: true, desde: '', fecha_limite: '' }, datosMeta));
      });
    } else if (accion === 'borrarMeta') {
      todos.forEach(d => { d.metas = (d.metas || []).filter(m => m.id !== b.id); });
    } else if (accion === 'guardarCategoria') {
      todos.forEach(d => {
        const c = d.categorias.find(x => x.id === b.id);
        if (c) ['nombre', 'seccion', 'tipo', 'orden', 'activa'].forEach(k => { if (b[k] !== undefined) c[k] = b[k]; });
        else if (b.nombre) d.categorias.push({ id: b.id, nombre: b.nombre, seccion: b.seccion, tipo: b.tipo, orden: (Math.max.apply(null, d.categorias.map(x => x.orden).concat([0])) + 1), activa: true });
        d.categorias.sort((x, y) => x.orden - y.orden);
      });
    }
    Object.keys(st.datos).forEach(guardarLocal);
  }

  /** Registra un cambio: se ve al instante y se envía por detrás */
  function cambiar(accion, body) {
    aplicarLocal(accion, body);
    st.cola.push({ accion: accion, body: body });
    LS.set('g_cola', JSON.stringify(st.cola));
    pintarSync();
    enviarCola();
  }

  /* ───────── Sincronización ───────── */
  let enviando = false, reintento = null;
  function pintarSync(txt) {
    const n = st.cola.length;
    $('sync').textContent = txt || (n === 1 ? '1 pendiente' : n + ' pendientes');
    $('sync').classList.toggle('hidden', !txt && n === 0);
  }

  function enviarCola() {
    if (enviando || !st.cola.length || !st.url) return;
    enviando = true;
    const item = st.cola[0];
    api.post(item.accion, item.body).then(() => {
      st.cola.shift();
    }).catch(e => {
      if (e instanceof ErrorServidor) {       // el servidor lo rechazó: se descarta y se recargan los datos reales
        st.cola.shift();
        toast(e.message, true);
        recargarDatos(st.anio);
      } else {                                // sin señal: se reintenta más tarde
        clearTimeout(reintento);
        reintento = setTimeout(enviarCola, 15000);
        throw e;
      }
    }).then(() => {
      LS.set('g_cola', JSON.stringify(st.cola));
      enviando = false;
      pintarSync();
      if (st.cola.length) enviarCola(); else recargarDatos(st.anio, true);
    }, () => { enviando = false; pintarSync(); });
  }
  window.addEventListener('online', enviarCola);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { enviarCola(); if (!st.cola.length) recargarDatos(st.anio, true); } });

  /** Trae el año desde Google y vuelve a aplicar lo que aún no se envía */
  let cargando = {};
  function recargarDatos(anio, silencioso) {
    if (cargando[anio] || !st.url) return cargando[anio] || Promise.resolve();
    cargando[anio] = api.get('datos', { anio: anio }).then(r => {
      delete r.ok;
      st.datos[anio] = r;
      st.cola.forEach(c => aplicarLocal(c.accion, c.body));
      guardarLocal(anio);
      repintar();
    }).catch(e => {
      if (!datos(anio)) $('iCargando').textContent = e.message;
      else if (!silencioso && e instanceof ErrorServidor) toast(e.message, true);
    }).then(() => { delete cargando[anio]; });
    return cargando[anio];
  }

  function asegurarAnio(anio) {
    if (!st.datos[anio]) cargarLocal(anio);
    if (!st.datos[anio]) return recargarDatos(anio);
    return Promise.resolve();
  }

  /* ───────── Navegación ───────── */
  const PANTALLAS = ['inicio', 'movimientos', 'agregar', 'historial', 'ajustes'];
  const alEntrar = {};
  let actual = 'inicio';
  let ajuste = null;
  function irA(s) {
    actual = s;
    PANTALLAS.forEach(x => $('s-' + x).classList.toggle('hidden', x !== s));
    document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('on', b.dataset.s === s));
    window.scrollTo(0, 0);
    if (alEntrar[s]) alEntrar[s]();
  }
  // Repintar tras sincronizar: nunca redibuja un formulario abierto (se perdería lo que estás escribiendo)
  function repintar() {
    if ($('hoja').classList.contains('hidden') === false) return;
    if (actual === 'ajustes') { if (ajuste === 'categorias') pintarCategorias(); if (ajuste === 'metas') pintarMetasAjustes(); return; }
    if (actual === 'agregar') return;
    if (alEntrar[actual]) alEntrar[actual]();
  }
  document.querySelectorAll('.nav button').forEach(b => { b.onclick = () => irA(b.dataset.s); });

  /* ───────── Conectar ───────── */
  function conectar(url, token, boton, textoBoton, desdeAjustes) {
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) return toast('La URL debe terminar en /exec', true);
    if (!token) return toast('Ingresa tu clave', true);
    boton.disabled = true; boton.textContent = 'Conectando…';
    api.get('datos', { anio: st.anio }, url, token).then(r => {
      st.url = url; st.token = token; LS.set('g_url', url); LS.set('g_token', token);
      delete r.ok; st.datos = {}; st.datos[st.anio] = r; guardarLocal(st.anio);
      $('vConectar').classList.add('hidden'); $('vApp').classList.remove('hidden');
      if (desdeAjustes) { toast('Conexión guardada'); enviarCola(); return; }
      irA('inicio'); toast('¡Conectado!');
    }).catch(e => toast(e.message, true)).then(() => { boton.disabled = false; boton.textContent = textoBoton; });
  }
  $('cConectar').onclick = () => conectar($('cUrl').value.trim().split('?')[0], $('cClave').value.trim(), $('cConectar'), 'Conectar');

  /* ───────── Inicio ───────── */
  function llenarSelectores() {
    const m = $('iMes'), a = $('iAnio');
    if (!m.options.length) MESES.forEach((n, i) => m.add(new Option(n, i + 1)));
    if (!a.options.length) for (let y = hoy.getFullYear() - 3; y <= hoy.getFullYear() + 1; y++) a.add(new Option(y, y));
    m.value = st.mes; a.value = st.anio;
  }
  $('iMes').onchange = () => { st.mes = Number($('iMes').value); st.sobreAbierto = null; pintarInicio(); };
  $('iAnio').onchange = () => { st.anio = Number($('iAnio').value); st.sobreAbierto = null; asegurarAnio(st.anio).then(pintarInicio); pintarInicio(); };

  function pintarInicio() {
    llenarSelectores();
    if (!datos()) { $('iPanel').classList.add('hidden'); $('iCargando').classList.remove('hidden'); return; }
    $('iCargando').classList.add('hidden');
    $('iPanel').classList.remove('hidden');
    const p = panelDe(st.anio, st.mes);

    const pct = p.depositar > 0 ? Math.round(p.gastado / p.depositar * 100) : 0;
    const C = 2 * Math.PI * 66;
    $('anilloArco').setAttribute('stroke-dasharray', (Math.min(pct, 100) / 100 * C) + ' ' + C);
    $('anilloArco').setAttribute('class', 'anillo-arco ' + claseUso(pct));
    $('anilloMonto').textContent = pesos(p.disponible);
    $('anilloMonto').classList.toggle('neg', p.disponible < 0);
    $('anilloPct').textContent = p.sinPresupuesto ? 'Gastado ' + pesos(p.gastado) : pct + '% usado';
    $('sinPres').classList.toggle('hidden', !p.sinPresupuesto);
    $('inicioMeta').innerHTML = p.sinPresupuesto ? '' :
      (p.diasRestantes > 0 ? 'Puedes gastar <b>' + pesos(p.porDia) + '/día</b> · ' + (p.diasRestantes === 1 ? 'último día' : p.diasRestantes + ' días') + '<br>' : '') +
      'Gastado ' + pesos(p.gastado) + ' de ' + pesos(p.depositar);

    $('sobres').innerHTML = p.sobres.map((s, i) => {
      const pctS = s.pres ? Math.round(s.real / s.pres * 100) : 0;
      return '<button class="sobre' + (st.sobreAbierto === s.seccion ? ' abierto' : '') + '" data-i="' + i + '" data-estado="' + s.estado + '">' +
        '<div class="sobre-nombre">' + esc(s.seccion) + '</div><div class="sobre-real">' + pesos(s.real) + '</div>' +
        '<div class="sobre-pres">' + (s.pres ? 'de ' + pesos(s.pres) : 'sin tope') + '</div>' +
        (s.pres ? '<div class="barra"><b class="' + claseUso(pctS) + '" style="width:' + Math.min(100, pctS) + '%"></b></div>' : '') + '</button>';
    }).join('') || '<div class="vacio">Sin gastos este mes</div>';
    document.querySelectorAll('.sobre').forEach(b => {
      b.onclick = () => { const s = p.sobres[b.dataset.i].seccion; st.sobreAbierto = st.sobreAbierto === s ? null : s; pintarInicio(); };
    });

    pintarTendencias(p);
    pintarMetasInicio();

    const det = $('sobreDetalle');
    const s = p.sobres.find(x => x.seccion === st.sobreAbierto);
    if (!s) { det.classList.add('hidden'); return; }
    det.classList.remove('hidden');
    const ids = s.categorias.map(c => c.id);
    const ult = movimientosMes().filter(m => ids.indexOf(m.categoria_id) > -1).slice(0, 5);
    det.innerHTML = '<p class="lbl">' + esc(s.seccion) + '</p>' + s.categorias.map(c => {
      const pc = c.pres ? Math.round(c.real / c.pres * 100) : 0;
      return '<div class="it"><div class="it-t"><span>' + esc(c.nombre) + (c.pres ? '' : '<span class="tag">sin tope</span>') + '</span>' +
        '<span class="' + (c.pres && c.real > c.pres ? 'neg' : '') + '">' + pesos(c.real) + (c.pres ? ' / ' + pesos(c.pres) : '') + '</span></div>' +
        (c.pres ? '<div class="barra"><b class="' + claseUso(pc) + '" style="width:' + Math.min(100, pc) + '%"></b></div>' : '') + '</div>';
    }).join('') + (ult.length ? '<p class="lbl" style="margin-top:12px">Últimos</p>' + ult.map(m =>
      '<div class="it"><div class="it-t"><span>' + esc(nombreCat(m.categoria_id)) + ' <span class="mut peq">' + Number(m.fecha.slice(8)) + ' ' +
      MESES[st.mes - 1].slice(0, 3).toLowerCase() + (m.nota ? ' · ' + esc(m.nota) : '') + '</span></span><span>' + pesos(m.monto) + '</span></div></div>').join('') : '');
  }
  /* Tendencias: este mes vs lo que llevabas al mismo día en los 3 meses anteriores */
  function pintarTendencias(p) {
    const caja = $('tendencias');
    let movs = movsCalc(datos());
    const ant = datos(st.anio - 1);
    if (ant) movs = movs.concat(movsCalc(ant));
    else if (st.mes <= 3) asegurarAnio(st.anio - 1).then(() => { if (actual === 'inicio' && datos(st.anio - 1)) pintarInicio(); });
    const ahora = new Date();
    const c = compararCategorias_({ categorias: datos().categorias, movimientos: movs, anio: st.anio, mes: st.mes, hoy: ahora, meses: 3 });
    const fijos = p.sobres.filter(x => x.tipo !== 'variable').reduce((a, x) => a + x.real, 0);
    const pr = p.sinPresupuesto ? null : proyeccionMes_({ gastado: p.gastado, fijos: fijos, depositar: p.depositar, anio: st.anio, mes: st.mes, hoy: ahora });
    if (!c.items.length && !pr) { caja.classList.add('hidden'); return; }
    caja.classList.remove('hidden');
    const corte = c.diaCorte >= 28 ? 'en el mes' : 'al día ' + c.diaCorte;
    caja.innerHTML = '<p class="lbl">Tendencias</p>' +
      (pr ? '<p class="proy">A este ritmo cerrarías el mes en <b>' + pesos(pr.proyectado) + '</b>: ' +
        (pr.diferencia < 0 ? '<span class="neg">te pasarías por ' + pesos(-pr.diferencia) + '</span>' : '<span class="pos">te sobrarían ' + pesos(pr.diferencia) + '</span>') + '</p>' : '') +
      c.items.map(i => '<div class="tend"><span>' + esc(i.nombre) + '<small>' + pesos(i.actual) + ' vs ' + pesos(i.promedio) + ' promedio ' + corte + '</small></span>' +
        '<span class="' + (i.cambio > 0 ? 'sube' : 'baja') + '">' + (i.cambio > 0 ? '▲' : '▼') + Math.abs(i.cambio) + '%</span></div>').join('');
  }

  /* Metas de ahorro (siempre del año en curso) */
  function datosMetas() { return datos(hoy.getFullYear()) || datos(); }
  function progreso(meta) {
    const d = datosMetas();
    return progresoMeta_({ meta: meta, acumuladoAntes: meta.acumuladoAntes, movimientos: movsCalc(d), hoy: new Date() });
  }
  function fechaCorta(s) { return s ? MESES[Number(s.slice(5, 7)) - 1].slice(0, 3).toLowerCase() + ' ' + s.slice(0, 4) : ''; }
  function metaHTML(m) {
    const p = progreso(m);
    return '<div style="font-weight:600">' + esc(m.nombre) + '</div>' +
      '<div class="it-t" style="margin-top:2px"><span><b>' + pesos(p.actual) + '</b> <span class="mut peq">de ' + pesos(m.objetivo) + '</span></span><span class="mut peq">' + p.pct + '%</span></div>' +
      '<div class="barra"><b style="width:' + p.pct + '%"></b></div>' +
      '<div class="mut peq" style="margin-top:4px">' + (p.faltante === 0 ? '¡Meta cumplida! 🎉' :
        (p.sugeridoMensual !== null ? 'Aporta ' + pesos(p.sugeridoMensual) + '/mes hasta ' + fechaCorta(m.fecha_limite) : 'Faltan ' + pesos(p.faltante))) + '</div>';
  }
  function pintarMetasInicio() {
    const d = datosMetas(), metas = ((d && d.metas) || []).filter(m => m.activa !== false);
    $('metas').innerHTML = '<p class="lbl">Metas de ahorro</p>' + (metas.length ? metas.map(m => '<div class="meta-it">' + metaHTML(m) + '</div>').join('') :
      '<button class="link-suave" id="metasCrear">+ Crear una meta de ahorro</button>');
    if ($('metasCrear')) $('metasCrear').onclick = () => { irA('ajustes'); abrirAjuste('metas'); editarMeta(null); };
  }

  $('sinPresIr').onclick = e => { e.preventDefault(); irA('ajustes'); abrirAjuste('presupuesto'); };
  alEntrar.inicio = pintarInicio;

  /* ───────── Catálogo ───────── */
  function nombreCat(id) { const c = catalogo().find(x => x.id === id); return c ? c.nombre : '(sin categoría)'; }
  function grupoDeTipo(tipo) { return GASTO.indexOf(tipo) > -1 ? 'gasto' : tipo; }
  function seccionesDe(cats) { const s = []; cats.forEach(c => { if (s.indexOf(c.seccion) < 0) s.push(c.seccion); }); return s; }

  /** Movimientos del mes visible, más recientes primero */
  function movimientosMes() {
    const d = datos();
    if (!d) return [];
    const pref = st.anio + '-' + dos(st.mes);
    return d.movimientos.filter(m => m.fecha.slice(0, 7) === pref)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  }

  /* ───────── Agregar ───────── */
  [1000, 2000, 5000, 10000, 20000].forEach(v => {
    const b = document.createElement('button'); b.textContent = '+' + pesos(v);
    b.onclick = () => { $('aMonto').value = pesos(Number(digitos($('aMonto').value) || 0) + v); actualizarAgregar(); };
    $('aRapidos').appendChild(b);
  });
  $('aMonto').addEventListener('input', e => { const d = digitos(e.target.value); e.target.value = d ? pesos(d) : ''; actualizarAgregar(); });
  document.querySelectorAll('.chip-tipo').forEach(b => {
    b.onclick = () => { st.agregar = { tipo: b.dataset.tipo, seccion: '', categoria: '' }; pintarAgregar(); };
  });

  function pintarAgregar() {
    if (!$('aFecha').value || $('aFecha').dataset.auto) { $('aFecha').value = fechaTxt(new Date()); $('aFecha').dataset.auto = '1'; }
    document.querySelectorAll('.chip-tipo').forEach(b => b.classList.toggle('on', b.dataset.tipo === st.agregar.tipo));
    const activas = catalogo().filter(c => c.activa && grupoDeTipo(c.tipo) === st.agregar.tipo);
    const secciones = seccionesDe(activas);
    if (secciones.indexOf(st.agregar.seccion) < 0) st.agregar.seccion = secciones[0] || '';
    $('aSecciones').innerHTML = secciones.map(s => '<button class="chip' + (s === st.agregar.seccion ? ' on' : '') + '">' + esc(s) + '</button>').join('');
    $('aSecciones').querySelectorAll('.chip').forEach((b, i) => { b.onclick = () => { st.agregar.seccion = secciones[i]; st.agregar.categoria = ''; pintarAgregar(); }; });
    const cats = activas.filter(c => c.seccion === st.agregar.seccion);
    if (!cats.some(c => c.id === st.agregar.categoria)) st.agregar.categoria = '';
    $('aCategorias').innerHTML = cats.map(c => '<button class="chip' + (c.id === st.agregar.categoria ? ' on' : '') + '">' + esc(c.nombre) + '</button>').join('') || '<span class="mut">No hay categorías activas</span>';
    $('aCategorias').querySelectorAll('.chip').forEach((b, i) => { b.onclick = () => { st.agregar.categoria = cats[i].id; pintarAgregar(); }; });
    actualizarAgregar();
  }
  $('aFecha').addEventListener('change', () => { delete $('aFecha').dataset.auto; });

  function actualizarAgregar() {
    const ok = digitos($('aMonto').value) && st.agregar.categoria && $('aFecha').value;
    $('aGuardar').disabled = !ok;
    $('aResumen').textContent = st.agregar.categoria ? nombreCat(st.agregar.categoria) + ' · ' + st.agregar.seccion : 'Elige una categoría';
  }

  $('aGuardar').onclick = () => {
    const monto = Number(digitos($('aMonto').value));
    if (!monto || !st.agregar.categoria || $('aGuardar').disabled) return;
    $('aGuardar').disabled = true;                        // evita el doble toque
    const fecha = $('aFecha').value;
    const anio = Number(fecha.slice(0, 4)), mes = Number(fecha.slice(5, 7));
    asegurarAnio(anio).then(() => {
      cambiar('registrar', { id: nuevoId(), fecha: fecha, categoria_id: st.agregar.categoria, monto: monto, nota: $('aNota').value.trim() });
      $('aMonto').value = ''; $('aNota').value = ''; st.agregar.categoria = '';
      st.anio = anio; st.mes = mes;
      const p = panelDe(anio, mes);
      toast('Guardado' + (p.sinPresupuesto ? '' : ' · te quedan ' + pesos(p.disponible)));
      irA('inicio');
    });
  };
  alEntrar.agregar = pintarAgregar;

  /* ───────── Movimientos ───────── */
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  function pintarMovimientos() {
    $('mMesTxt').textContent = MESES[st.mes - 1].slice(0, 3) + ' ' + st.anio;
    const q = $('mBuscar').value.trim().toLowerCase();
    const lista = movimientosMes().filter(m => !q || nombreCat(m.categoria_id).toLowerCase().indexOf(q) > -1 || String(m.nota).toLowerCase().indexOf(q) > -1);
    if (!lista.length) { $('mLista').innerHTML = '<div class="vacio">' + (q ? 'Nada coincide con "' + esc(q) + '"' : 'Sin movimientos este mes') + '</div>'; return; }
    const grupos = [];
    lista.forEach(m => { const g = grupos[grupos.length - 1]; if (g && g.fecha === m.fecha) g.items.push(m); else grupos.push({ fecha: m.fecha, items: [m] }); });
    $('mLista').innerHTML = grupos.map(g => {
      const d = aFecha(g.fecha), total = g.items.reduce((a, m) => a + m.monto, 0);
      return '<div class="dia">' + DIAS[d.getDay()] + ' ' + d.getDate() + ' ' + MESES[d.getMonth()].slice(0, 3).toLowerCase() + ' · ' + pesos(total) + '</div><div class="grupo">' +
        g.items.map(m => {
          const c = catalogo().find(x => x.id === m.categoria_id);
          return '<button class="mov" data-id="' + esc(m.id) + '"><div class="info"><div>' + esc(nombreCat(m.categoria_id)) + '</div><div>' +
            esc(c ? c.seccion : '') + (m.nota ? ' · ' + esc(m.nota) : '') + '</div></div><span class="m' + (m.monto < 0 ? ' neg' : '') + '">' + pesos(m.monto) + '</span></button>';
        }).join('') + '</div>';
    }).join('');
    $('mLista').querySelectorAll('.mov').forEach(b => { b.onclick = () => abrirEdicion(b.dataset.id); });
  }
  $('mBuscar').addEventListener('input', pintarMovimientos);
  alEntrar.movimientos = pintarMovimientos;

  function cerrarHoja() { $('hoja').classList.add('hidden'); }
  $('hoja').addEventListener('click', e => { if (e.target === $('hoja')) cerrarHoja(); });

  function abrirEdicion(id) {
    const m = movimientosMes().find(x => x.id === id);
    if (!m) return;
    const cats = catalogo().filter(c => c.activa || c.id === m.categoria_id), secs = seccionesDe(cats);
    $('hojaCaja').innerHTML = '<h2>Editar movimiento</h2><div class="card">' +
      '<label class="fila"><span class="lbl0">Monto</span><input id="eMonto" inputmode="numeric" value="' + pesos(m.monto) + '"></label>' +
      '<label class="fila"><span class="lbl0">Categoría</span><select id="eCategoria">' + secs.map(s => '<optgroup label="' + esc(s) + '">' +
        cats.filter(c => c.seccion === s).map(c => '<option value="' + esc(c.id) + '"' + (c.id === m.categoria_id ? ' selected' : '') + '>' + esc(c.nombre) + '</option>').join('') + '</optgroup>').join('') + '</select></label>' +
      '<label class="fila"><span class="lbl0">Fecha</span><input type="date" id="eFecha" value="' + m.fecha + '"></label>' +
      '<label class="fila"><span class="lbl0">Nota</span><input id="eNota" value="' + esc(m.nota) + '" placeholder="Opcional"></label></div>' +
      '<div class="botones"><button class="btn-sec btn-del" id="eBorrar">Borrar</button><button class="btn-pri" id="eGuardar" style="margin:0">Guardar</button></div>' +
      '<button class="btn-sec" id="eCancelar" style="width:100%;margin-top:10px">Cancelar</button>';
    $('hoja').classList.remove('hidden');
    $('eMonto').addEventListener('input', e => { const neg = /^\s*-/.test(e.target.value), d = digitos(e.target.value); e.target.value = d ? (neg ? '-' : '') + pesos(d) : (neg ? '-' : ''); });
    $('eCancelar').onclick = cerrarHoja;
    $('eGuardar').onclick = () => {
      const t = $('eMonto').value, monto = (/^\s*-/.test(t) ? -1 : 1) * Number(digitos(t));
      const cambios = {};
      if (monto !== m.monto) cambios.monto = monto;
      if ($('eCategoria').value !== m.categoria_id) cambios.categoria_id = $('eCategoria').value;
      if ($('eFecha').value !== m.fecha) cambios.fecha = $('eFecha').value;
      if ($('eNota').value.trim() !== (m.nota || '')) cambios.nota = $('eNota').value.trim();
      cerrarHoja();
      if (!Object.keys(cambios).length) return;
      const destino = cambios.fecha ? Number(cambios.fecha.slice(0, 4)) : st.anio;
      asegurarAnio(destino).then(() => { cambiar('editar', Object.assign({ id: m.id }, cambios)); toast('Cambios guardados'); pintarMovimientos(); });
    };
    let seguro = false;
    $('eBorrar').onclick = () => {
      if (!seguro) { seguro = true; $('eBorrar').textContent = '¿Seguro? Toca otra vez'; return; }
      cerrarHoja();
      cambiar('borrar', { id: m.id });
      toast('Movimiento borrado');
      pintarMovimientos();
    };
  }

  /* ───────── Historial ───────── */
  function pintarHistorial() {
    const sel = $('hAnio');
    if (!sel.options.length) { for (let y = hoy.getFullYear() - 3; y <= hoy.getFullYear() + 1; y++) sel.add(new Option(y, y)); sel.value = st.anio; }
    const anio = Number(sel.value), d = datos(anio);
    if (!d) { $('hLista').innerHTML = '<div class="cargando">Cargando…</div>'; asegurarAnio(anio).then(() => { if (datos(anio)) pintarHistorial(); }); return; }
    const H = calcularHistorial_({ categorias: d.categorias, movimientos: movsCalc(d), presupuestosPorMes: d.presupuestos || {}, colchonDefault: d.colchonDefault, anio: anio });
    const max = Math.max.apply(null, H.map(h => Math.max(h.gastado, h.gastado ? h.depositar : 0)).concat([1]));
    const ancho = 320 / 12;
    $('hGrafico').innerHTML = H.map((h, i) => {
      const alto = Math.round(h.gastado / max * 100), x = i * ancho + 5, yTope = 105 - Math.round(h.depositar / max * 100);
      return '<rect class="b' + (h.gastado > h.depositar ? ' over' : '') + '" x="' + x + '" y="' + (105 - alto) + '" width="' + (ancho - 10) + '" height="' + alto + '" rx="2"/>' +
        (h.gastado ? '<line class="tope" x1="' + (x - 2) + '" x2="' + (x + ancho - 6) + '" y1="' + yTope + '" y2="' + yTope + '"/>' : '') +
        '<text x="' + (x + (ancho - 10) / 2) + '" y="117" text-anchor="middle">' + MESES[i].slice(0, 1) + '</text>';
    }).join('');
    const conDatos = H.filter(h => h.gastado).reverse();
    $('hLista').innerHTML = conDatos.length ? conDatos.map(h => {
      const dif = h.depositar - h.gastado;
      return '<button class="mov hmes" data-mes="' + h.mes + '"><div class="info"><div>' + MESES[h.mes - 1] + '</div><div>' + pesos(h.gastado) + ' de ' + pesos(h.depositar) + '</div></div>' +
        '<span class="m ' + (dif < 0 ? 'neg' : 'pos') + '">' + (dif >= 0 ? '+' : '') + pesos(dif) + '</span></button>';
    }).join('') : '<div class="vacio">Sin datos este año</div>';
    $('hLista').querySelectorAll('.hmes').forEach(b => { b.onclick = () => { st.anio = anio; st.mes = Number(b.dataset.mes); st.sobreAbierto = null; irA('inicio'); }; });
  }
  $('hAnio').onchange = pintarHistorial;
  alEntrar.historial = pintarHistorial;

  /* ───────── Ajustes ───────── */
  const TITULOS_AJ = { presupuesto: 'Presupuesto', metas: 'Metas de ahorro', categorias: 'Categorías', conexion: 'Conexión' };
  const ETIQ_TIPO = { ingreso: 'Ingreso', ahorro: 'Ahorro', fijo: 'Gasto fijo', variable: 'Gasto variable', deuda: 'Deuda' };
  document.querySelectorAll('[data-aj]').forEach(b => { b.onclick = () => abrirAjuste(b.dataset.aj); });
  $('ajVolver').onclick = () => abrirAjuste(null);
  alEntrar.ajustes = () => abrirAjuste(null);

  function abrirAjuste(cual) {
    ajuste = cual;
    $('ajMenu').classList.toggle('hidden', !!cual);
    $('ajVolver').classList.toggle('hidden', !cual);
    $('ajTitulo').textContent = cual ? TITULOS_AJ[cual] : 'Ajustes';
    Object.keys(TITULOS_AJ).forEach(k => $('aj-' + k).classList.toggle('hidden', k !== cual));
    if (cual === 'presupuesto') pintarPresupuesto();
    if (cual === 'categorias') pintarCategorias();
    if (cual === 'conexion') pintarConexion();
    if (cual === 'metas') pintarMetasAjustes();
  }

  function pintarMetasAjustes() {
    const d = datosMetas(), metas = (d && d.metas) || [];
    $('aj-metas').innerHTML = '<button class="btn-pri" id="gNueva">+ Nueva meta</button>' +
      metas.map(m => '<button class="meta-row" data-id="' + esc(m.id) + '">' + metaHTML(m) + '</button>').join('') +
      (metas.length ? '' : '<div class="vacio">Una meta avanza sola con lo que registres en sus categorías de ahorro.</div>');
    $('gNueva').onclick = () => editarMeta(null);
    $('aj-metas').querySelectorAll('.meta-row').forEach(b => { b.onclick = () => editarMeta(metas.find(m => m.id === b.dataset.id)); });
  }

  function editarMeta(m) {
    const ahorro = catalogo().filter(c => c.tipo === 'ahorro' && (c.activa || (m && m.categorias.indexOf(c.id) > -1)));
    const sel = m ? m.categorias : [];
    $('hojaCaja').innerHTML = '<h2>' + (m ? 'Editar meta' : 'Nueva meta') + '</h2><div class="card">' +
      '<label class="fila"><span class="lbl0">Nombre</span><input id="gNombre" value="' + (m ? esc(m.nombre) : '') + '" placeholder="Ej: Viaje a Japón"></label>' +
      '<label class="fila"><span class="lbl0">Objetivo</span><input id="gObjetivo" inputmode="numeric" value="' + (m ? pesos(m.objetivo) : '') + '" placeholder="$0"></label>' +
      '<label class="fila"><span class="lbl0">Ya tengo</span><input id="gInicial" inputmode="numeric" value="' + (m && m.inicial ? pesos(m.inicial) : '') + '" placeholder="$0"></label>' +
      '<label class="fila"><span class="lbl0">Desde</span><input type="date" id="gDesde" value="' + (m ? m.desde : fechaTxt(new Date())) + '"></label>' +
      '<label class="fila"><span class="lbl0">Para el</span><input type="date" id="gLimite" value="' + (m ? m.fecha_limite : '') + '"></label></div>' +
      '<div class="card cats-chk"><p class="lbl">Suma lo que registres en</p>' + (ahorro.map(c => '<label><input type="checkbox" class="gCat" value="' + esc(c.id) + '"' + (sel.indexOf(c.id) > -1 ? ' checked' : '') + '>' + esc(c.nombre) + '</label>').join('') ||
        '<span class="mut">No tienes categorías de ahorro</span>') + '</div>' +
      '<div class="botones">' + (m ? '<button class="btn-sec btn-del" id="gBorrar">Borrar</button>' : '<button class="btn-sec" id="gCancelar">Cancelar</button>') +
      '<button class="btn-pri" id="gGuardar" style="margin:0">Guardar</button></div>';
    $('hoja').classList.remove('hidden');
    ['gObjetivo', 'gInicial'].forEach(id => $(id).addEventListener('input', e => { const v = digitos(e.target.value); e.target.value = v ? pesos(v) : ''; }));
    if ($('gCancelar')) $('gCancelar').onclick = cerrarHoja;
    $('gGuardar').onclick = () => {
      const datosMeta = {
        id: m ? m.id : nuevoId(), nombre: $('gNombre').value.trim(), objetivo: Number(digitos($('gObjetivo').value)),
        inicial: Number(digitos($('gInicial').value)) || 0, desde: $('gDesde').value, fecha_limite: $('gLimite').value,
        categorias: Array.from(document.querySelectorAll('.gCat:checked')).map(x => x.value),
      };
      if (!datosMeta.nombre) return toast('Ponle un nombre a la meta', true);
      if (!datosMeta.objetivo) return toast('Indica el objetivo', true);
      let envio = datosMeta;
      if (m) {                                         // solo lo que cambió
        envio = { id: m.id };
        Object.keys(datosMeta).forEach(k => { if (JSON.stringify(datosMeta[k]) !== JSON.stringify(m[k])) envio[k] = datosMeta[k]; });
        if (Object.keys(envio).length === 1) return cerrarHoja();
      }
      cerrarHoja();
      cambiar('guardarMeta', envio);
      toast(m ? 'Meta actualizada' : 'Meta creada');
      pintarMetasAjustes();
    };
    let seguro = false;
    if ($('gBorrar')) $('gBorrar').onclick = () => {
      if (!seguro) { seguro = true; $('gBorrar').textContent = '¿Seguro? Toca otra vez'; return; }
      cerrarHoja();
      cambiar('borrarMeta', { id: m.id });
      toast('Meta borrada');
      pintarMetasAjustes();
    };
  }

  function pintarPresupuesto() {
    const caja = $('aj-presupuesto'), d = datos();
    if (!d) { caja.innerHTML = '<div class="cargando">Cargando…</div>'; return; }
    const ref = { anio: st.anio, mes: st.mes };
    const pres = (d.presupuestos || {})[ref.mes] || {};
    const items = Object.assign({}, pres); delete items._colchon;
    const colchon = pres._colchon !== undefined ? pres._colchon : d.colchonDefault;
    const cats = d.categorias.filter(c => c.activa || items[c.id]);
    const ingresos = cats.filter(c => c.tipo === 'ingreso'), gastos = cats.filter(c => GASTO.indexOf(c.tipo) > -1);
    const input = c => '<div class="it-t it"><span>' + esc(c.nombre) + '</span><input class="pres-in" data-id="' + esc(c.id) + '" inputmode="numeric" placeholder="sin tope" value="' + (items[c.id] ? pesos(items[c.id]) : '') + '"></div>';
    caja.innerHTML =
      '<p class="mut peq" style="margin:0 4px 10px">' + MESES[ref.mes - 1] + ' ' + ref.anio + ' · cambia el mes en Inicio</p>' +
      '<button class="btn-sec" id="pCopiar" style="width:100%;margin-bottom:14px">Copiar del mes anterior</button>' +
      '<div class="card"><p class="lbl">Ingresos esperados</p>' + ingresos.map(input).join('') +
      '<div class="it-t it"><span>Colchón</span><input class="pres-in" id="pColchon" inputmode="numeric" value="' + pesos(colchon) + '"></div></div>' +
      seccionesDe(gastos).map(s => '<div class="card"><p class="lbl">' + esc(s) + '</p>' + gastos.filter(c => c.seccion === s).map(input).join('') + '</div>').join('') +
      '<div class="card total"><span>Total a depositar</span><span id="pTotal"></span></div>' +
      '<button class="btn-pri" id="pGuardar">Guardar presupuesto</button>';
    const recalcular = () => {
      let t = Number(digitos($('pColchon').value)) || 0;
      caja.querySelectorAll('.pres-in[data-id]').forEach(i => {
        const c = d.categorias.find(x => x.id === i.dataset.id);
        if (c && GASTO.indexOf(c.tipo) > -1) t += Number(digitos(i.value)) || 0;
      });
      $('pTotal').textContent = pesos(t);
    };
    caja.querySelectorAll('.pres-in').forEach(i => i.addEventListener('input', () => { const v = digitos(i.value); i.value = v ? pesos(v) : ''; recalcular(); }));
    recalcular();
    $('pGuardar').onclick = () => {
      const nuevos = Object.assign({}, items);           // conserva topes que no se muestran (ej. ahorro)
      caja.querySelectorAll('.pres-in[data-id]').forEach(i => { const v = Number(digitos(i.value)); if (v) nuevos[i.dataset.id] = v; else delete nuevos[i.dataset.id]; });
      cambiar('guardarPresupuesto', { anio: ref.anio, mes: ref.mes, items: nuevos, colchon: Number(digitos($('pColchon').value)) || 0 });
      toast('Presupuesto guardado');
    };
    $('pCopiar').onclick = () => {
      const ant = ref.mes === 1 ? { anio: ref.anio - 1, mes: 12 } : { anio: ref.anio, mes: ref.mes - 1 };
      asegurarAnio(ant.anio).then(() => {
        const src = datos(ant.anio);
        if (!src || !src.presupuestos || !src.presupuestos[ant.mes] || !Object.keys(src.presupuestos[ant.mes]).length) return toast('El mes anterior no tiene presupuesto', true);
        cambiar('copiarPresupuesto', ref);
        toast('Copiado del mes anterior');
        pintarPresupuesto();
      });
    };
  }

  function pintarCategorias() {
    const cats = catalogo();
    $('aj-categorias').innerHTML = '<button class="btn-pri" id="cNueva">+ Nueva categoría</button>' +
      seccionesDe(cats).map(s => {
        const deSec = cats.filter(c => c.seccion === s);
        return '<div class="card"><p class="lbl">' + esc(s) + '</p>' + deSec.map((c, i) =>
          '<div class="cat-row' + (c.activa ? '' : ' inactiva') + '" data-id="' + esc(c.id) + '">' +
          '<button class="nom">' + esc(c.nombre) + ' <span class="tag">' + ETIQ_TIPO[c.tipo] + '</span></button>' +
          '<button class="ord" data-dir="arriba"' + (i === 0 ? ' disabled' : '') + ' aria-label="Subir">↑</button>' +
          '<button class="ord" data-dir="abajo"' + (i === deSec.length - 1 ? ' disabled' : '') + ' aria-label="Bajar">↓</button>' +
          '<button class="ord act" aria-label="' + (c.activa ? 'Desactivar' : 'Activar') + '">' + (c.activa ? '●' : '○') + '</button></div>').join('') + '</div>';
      }).join('');
    $('cNueva').onclick = () => editarCategoria(null);
    $('aj-categorias').querySelectorAll('.cat-row').forEach(row => {
      const c = cats.find(x => x.id === row.dataset.id);
      row.querySelector('.nom').onclick = () => editarCategoria(c);
      row.querySelector('.act').onclick = () => guardarCat({ id: c.id, activa: !c.activa }, c.activa ? 'Desactivada: ya no aparece al agregar' : 'Activada');
      row.querySelectorAll('.ord[data-dir]').forEach(b => { b.onclick = () => moverCategoria(c, b.dataset.dir); });
    });
  }

  function guardarCat(datosCat, msg) {
    cambiar('guardarCategoria', datosCat);
    pintarCategorias();
    if (msg) toast(msg);
  }

  function moverCategoria(c, dir) {
    const deSec = catalogo().filter(x => x.seccion === c.seccion);
    const i = deSec.indexOf(c), j = dir === 'arriba' ? i - 1 : i + 1;
    if (j < 0 || j >= deSec.length) return;
    const otra = deSec[j], oc = c.orden;
    let oo = otra.orden;
    if (oc === oo) oo = dir === 'arriba' ? oc - 1 : oc + 1;
    cambiar('guardarCategoria', { id: c.id, orden: oo });
    guardarCat({ id: otra.id, orden: oc });
  }

  function editarCategoria(c) {
    const secs = seccionesDe(catalogo());
    $('hojaCaja').innerHTML = '<h2>' + (c ? 'Editar categoría' : 'Nueva categoría') + '</h2><div class="card">' +
      '<label class="fila"><span class="lbl0">Nombre</span><input id="kNombre" value="' + (c ? esc(c.nombre) : '') + '" placeholder="Ej: Delivery"></label>' +
      '<label class="fila"><span class="lbl0">Sección</span><select id="kSeccion">' + secs.map(s => '<option' + (c && c.seccion === s ? ' selected' : '') + '>' + esc(s) + '</option>').join('') +
      '<option value="__nueva">Nueva sección…</option></select></label>' +
      '<label class="fila hidden" id="kFilaSec"><span class="lbl0">Nueva</span><input id="kSeccionNueva" placeholder="Nombre de la sección"></label>' +
      '<label class="fila"><span class="lbl0">Tipo</span><select id="kTipo">' + Object.keys(ETIQ_TIPO).map(t => '<option value="' + t + '"' + ((c ? c.tipo : 'variable') === t ? ' selected' : '') + '>' + ETIQ_TIPO[t] + '</option>').join('') + '</select></label></div>' +
      '<div class="botones"><button class="btn-sec" id="kCancelar">Cancelar</button><button class="btn-pri" id="kGuardar" style="margin:0">Guardar</button></div>';
    $('hoja').classList.remove('hidden');
    $('kSeccion').onchange = () => $('kFilaSec').classList.toggle('hidden', $('kSeccion').value !== '__nueva');
    $('kCancelar').onclick = cerrarHoja;
    $('kGuardar').onclick = () => {
      const nombre = $('kNombre').value.trim();
      const seccion = $('kSeccion').value === '__nueva' ? $('kSeccionNueva').value.trim() : $('kSeccion').value;
      const tipo = $('kTipo').value;
      if (!nombre || !seccion) return toast('Falta el nombre o la sección', true);
      let d;
      if (!c) d = { id: nuevoId(), nombre: nombre, seccion: seccion, tipo: tipo };
      else {
        d = { id: c.id };
        if (nombre !== c.nombre) d.nombre = nombre;
        if (seccion !== c.seccion) d.seccion = seccion;
        if (tipo !== c.tipo) d.tipo = tipo;
        if (Object.keys(d).length === 1) return cerrarHoja();
      }
      cerrarHoja();
      guardarCat(d, c ? 'Categoría actualizada' : 'Categoría creada');
    };
  }

  function pintarConexion() {
    $('aj-conexion').innerHTML = '<div class="card">' +
      '<label class="campo"><span>URL del script</span><input id="xUrl" value="' + esc(st.url) + '" autocapitalize="off" autocorrect="off" spellcheck="false"></label>' +
      '<label class="campo"><span>Clave</span><input id="xClave" type="password" value="' + esc(st.token) + '"></label></div>' +
      '<button class="btn-pri" id="xGuardar">Guardar conexión</button>' +
      '<button class="link" id="xSalir" style="color:var(--err)">Desconectar este teléfono</button>';
    $('xGuardar').onclick = () => conectar($('xUrl').value.trim().split('?')[0], $('xClave').value.trim(), $('xGuardar'), 'Guardar conexión', true);
    $('xSalir').onclick = () => {
      Object.keys(localStorage).filter(k => k.indexOf('g_') === 0).forEach(LS.del);
      st.url = ''; st.token = ''; st.datos = {}; st.cola = [];
      pintarSync();
      $('vApp').classList.add('hidden'); $('vConectar').classList.remove('hidden');
    };
  }

  /* ───────── App instalada en el teléfono (abre sin internet) ───────── */
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  /* ───────── Arranque ───────── */
  LS.del('g_inicio');                                     // caché de la versión anterior
  if (!st.url || !st.token) {
    $('vConectar').classList.remove('hidden');
  } else {
    $('vApp').classList.remove('hidden');
    cargarLocal(st.anio);
    irA('inicio');                                        // muestra lo guardado al instante…
    pintarSync();
    recargarDatos(st.anio, true);                         // …y se pone al día por detrás
    enviarCola();
  }
})();
