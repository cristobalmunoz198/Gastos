/* Gastos — app del iPhone. Habla con tu Apps Script (URL /exec + clave). */
(function () {
  'use strict';

  /* ───────── Utilidades ───────── */
  const $ = id => document.getElementById(id);
  const LS = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
    del: k => { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const TIPOS_GASTO = ['fijo', 'variable', 'deuda'];
  const digitos = s => String(s).replace(/\D/g, '');
  const pesos = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(Number(n) || 0)).toLocaleString('es-CL');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hoyTxt = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const claseUso = pct => pct > 100 ? 'over' : pct >= 85 ? 'warn' : '';

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
    panel: null, catalogo: null, movimientos: null, sobreAbierto: null,
    agregar: { tipo: 'gasto', seccion: '', categoria: '' },
  };
  try { const c = JSON.parse(LS.get('g_inicio') || 'null'); if (c) { st.panel = c.panel; st.catalogo = c.catalogo; } } catch (e) {}

  /* ───────── API ───────── */
  function parse(txt) {
    try { return JSON.parse(txt); }
    catch (e) { throw new Error('No pude conectar. Revisa la URL y que el acceso sea "Cualquier usuario".'); }
  }
  const api = {
    get(accion, params, url, token) {
      const q = Object.assign({ formato: 'json', token: token || st.token, accion: accion }, params || {});
      const qs = Object.keys(q).map(k => k + '=' + encodeURIComponent(q[k])).join('&');
      return fetch((url || st.url) + '?' + qs).then(r => r.text()).then(parse).then(r => { if (!r.ok) throw new Error(r.msg || 'Error'); return r; });
    },
    post(accion, body) {
      const b = Object.assign({ accion: accion, token: st.token }, body);
      return fetch(st.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(b) })
        .then(r => r.text()).then(parse).then(r => { if (!r.ok) throw new Error(r.msg || 'Error'); return r; });
    },
  };

  /* ───────── Navegación ───────── */
  const PANTALLAS = ['inicio', 'movimientos', 'agregar', 'historial', 'ajustes'];
  const alEntrar = {};
  function irA(s) {
    PANTALLAS.forEach(x => $('s-' + x).classList.toggle('hidden', x !== s));
    document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('on', b.dataset.s === s));
    window.scrollTo(0, 0);
    if (alEntrar[s]) alEntrar[s]();
  }
  document.querySelectorAll('.nav button').forEach(b => { b.onclick = () => irA(b.dataset.s); });

  /* ───────── Conectar ───────── */
  $('cConectar').onclick = () => {
    const url = $('cUrl').value.trim().split('?')[0], token = $('cClave').value.trim();
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) return toast('La URL debe terminar en /exec', true);
    if (!token) return toast('Ingresa tu clave', true);
    const b = $('cConectar'); b.disabled = true; b.textContent = 'Conectando…';
    api.get('inicio', { anio: st.anio, mes: st.mes }, url, token).then(r => {
      st.url = url; st.token = token; LS.set('g_url', url); LS.set('g_token', token);
      recibirInicio(r);
      $('vConectar').classList.add('hidden'); $('vApp').classList.remove('hidden');
      irA('inicio'); toast('¡Conectado!');
    }).catch(e => toast(e.message, true)).then(() => { b.disabled = false; b.textContent = 'Conectar'; });
  };

  /* ───────── Inicio ───────── */
  function llenarSelectores() {
    const m = $('iMes'), a = $('iAnio');
    if (!m.options.length) MESES.forEach((n, i) => m.add(new Option(n, i + 1)));
    const anios = [];
    for (let y = hoy.getFullYear() - 3; y <= hoy.getFullYear() + 1; y++) anios.push(y);
    if (anios.indexOf(st.anio) < 0) anios.push(st.anio);
    a.innerHTML = ''; anios.sort().forEach(y => a.add(new Option(y, y)));
    m.value = st.mes; a.value = st.anio;
  }
  $('iMes').onchange = () => { st.mes = Number($('iMes').value); st.sobreAbierto = null; cargarInicio(); };
  $('iAnio').onchange = () => { st.anio = Number($('iAnio').value); st.sobreAbierto = null; cargarInicio(); };

  function recibirInicio(r) {
    st.panel = r.panel; st.catalogo = r.catalogo;
    if (r.panel.anio === hoy.getFullYear() && r.panel.mes === hoy.getMonth() + 1) LS.set('g_inicio', JSON.stringify({ panel: r.panel, catalogo: r.catalogo }));
    pintarInicio();
    pintarAgregar();
  }

  function cargarInicio() {
    if (!st.panel) $('iCargando').classList.remove('hidden');
    return api.get('inicio', { anio: st.anio, mes: st.mes }).then(recibirInicio)
      .catch(e => { if (!st.panel) $('iCargando').textContent = e.message; else toast(e.message, true); });
  }

  function pintarInicio() {
    llenarSelectores();
    const p = st.panel;
    if (!p || p.anio !== st.anio || p.mes !== st.mes) return;
    $('iCargando').classList.add('hidden');
    $('iPanel').classList.remove('hidden');

    // Anillo: cuánto del "Total a depositar" ya se gastó
    const pct = p.depositar > 0 ? Math.round(p.gastado / p.depositar * 100) : 0;
    const C = 2 * Math.PI * 66;
    const arco = $('anilloArco');
    arco.setAttribute('stroke-dasharray', (Math.min(pct, 100) / 100 * C) + ' ' + C);
    arco.setAttribute('class', 'anillo-arco ' + claseUso(pct));
    $('anilloMonto').textContent = pesos(p.disponible);
    $('anilloMonto').classList.toggle('neg', p.disponible < 0);
    $('anilloPct').textContent = p.sinPresupuesto ? 'Gastado ' + pesos(p.gastado) : pct + '% usado';
    $('sinPres').classList.toggle('hidden', !p.sinPresupuesto);
    $('inicioMeta').innerHTML = p.sinPresupuesto ? '' :
      (p.diasRestantes > 0 ? 'Puedes gastar <b>' + pesos(p.porDia) + '/día</b> · ' + (p.diasRestantes === 1 ? 'último día' : p.diasRestantes + ' días') + '<br>' : '') +
      'Gastado ' + pesos(p.gastado) + ' de ' + pesos(p.depositar);

    // Sobres
    $('sobres').innerHTML = p.sobres.map((s, i) => {
      const pctS = s.pres ? Math.round(s.real / s.pres * 100) : 0;
      return '<button class="sobre' + (st.sobreAbierto === s.seccion ? ' abierto' : '') + '" data-i="' + i + '" data-estado="' + s.estado + '">' +
        '<div class="sobre-nombre">' + esc(s.seccion) + '</div>' +
        '<div class="sobre-real">' + pesos(s.real) + '</div>' +
        '<div class="sobre-pres">' + (s.pres ? 'de ' + pesos(s.pres) : 'sin tope') + '</div>' +
        (s.pres ? '<div class="barra"><b class="' + claseUso(pctS) + '" style="width:' + Math.min(100, pctS) + '%"></b></div>' : '') +
        '</button>';
    }).join('') || '<div class="vacio">Sin gastos este mes</div>';
    document.querySelectorAll('.sobre').forEach(b => {
      b.onclick = () => { const s = p.sobres[b.dataset.i].seccion; st.sobreAbierto = st.sobreAbierto === s ? null : s; pintarInicio(); };
    });
    pintarDetalleSobre();
  }

  function pintarDetalleSobre() {
    const det = $('sobreDetalle');
    const s = st.panel && st.panel.sobres.find(x => x.seccion === st.sobreAbierto);
    if (!s) { det.classList.add('hidden'); return; }
    det.classList.remove('hidden');
    let html = '<p class="lbl">' + esc(s.seccion) + '</p>' + s.categorias.map(c => {
      const pc = c.pres ? Math.round(c.real / c.pres * 100) : 0;
      return '<div class="it"><div class="it-t"><span>' + esc(c.nombre) + (c.pres ? '' : '<span class="tag">sin tope</span>') + '</span>' +
        '<span class="' + (c.pres && c.real > c.pres ? 'neg' : '') + '">' + pesos(c.real) + (c.pres ? ' / ' + pesos(c.pres) : '') + '</span></div>' +
        (c.pres ? '<div class="barra"><b class="' + claseUso(pc) + '" style="width:' + Math.min(100, pc) + '%"></b></div>' : '') + '</div>';
    }).join('');
    // Últimos movimientos de la sección (si ya están cargados)
    if (st.movimientos && st.movimientos.anio === st.anio && st.movimientos.mes === st.mes) {
      const ids = s.categorias.map(c => c.id);
      const ult = st.movimientos.lista.filter(m => ids.indexOf(m.categoria_id) > -1).slice(0, 5);
      if (ult.length) html += '<p class="lbl" style="margin-top:12px">Últimos</p>' + ult.map(m =>
        '<div class="it"><div class="it-t"><span>' + esc(nombreCat(m.categoria_id)) + ' <span class="mut peq">' + Number(m.fecha.slice(8)) + ' ' + MESES[st.mes - 1].slice(0, 3).toLowerCase() + (m.nota ? ' · ' + esc(m.nota) : '') + '</span></span><span>' + pesos(m.monto) + '</span></div></div>').join('');
    } else {
      cargarMovimientos().then(() => { if (st.sobreAbierto === s.seccion) pintarDetalleSobre(); });
    }
    det.innerHTML = html;
  }
  $('sinPresIr').onclick = e => { e.preventDefault(); irA('ajustes'); abrirAjuste('presupuesto'); };
  alEntrar.inicio = () => { pintarInicio(); cargarInicio(); };

  /* ───────── Catálogo ───────── */
  function nombreCat(id) {
    const c = st.catalogo && st.catalogo.categorias.find(x => x.id === id);
    return c ? c.nombre : '(sin categoría)';
  }
  function grupoDeTipo(tipo) { return TIPOS_GASTO.indexOf(tipo) > -1 ? 'gasto' : tipo; }

  /* ───────── Movimientos (lista; se completa en la pantalla Movimientos) ───────── */
  let cargandoMov = null;
  function cargarMovimientos() {
    if (cargandoMov) return cargandoMov;
    const ref = { anio: st.anio, mes: st.mes };
    cargandoMov = api.get('movimientos', ref).then(r => { st.movimientos = Object.assign(ref, { lista: r.movimientos }); })
      .catch(e => toast(e.message, true)).then(() => { cargandoMov = null; });
    return cargandoMov;
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
    if (!$('aFecha').value) $('aFecha').value = hoyTxt();
    document.querySelectorAll('.chip-tipo').forEach(b => b.classList.toggle('on', b.dataset.tipo === st.agregar.tipo));
    if (!st.catalogo) return;
    const activas = st.catalogo.categorias.filter(c => c.activa && grupoDeTipo(c.tipo) === st.agregar.tipo);
    const secciones = [];
    activas.forEach(c => { if (secciones.indexOf(c.seccion) < 0) secciones.push(c.seccion); });
    if (secciones.indexOf(st.agregar.seccion) < 0) st.agregar.seccion = secciones[0] || '';
    $('aSecciones').innerHTML = secciones.map(s => '<button class="chip' + (s === st.agregar.seccion ? ' on' : '') + '">' + esc(s) + '</button>').join('');
    $('aSecciones').querySelectorAll('.chip').forEach((b, i) => { b.onclick = () => { st.agregar.seccion = secciones[i]; st.agregar.categoria = ''; pintarAgregar(); }; });
    const cats = activas.filter(c => c.seccion === st.agregar.seccion);
    if (!cats.some(c => c.id === st.agregar.categoria)) st.agregar.categoria = '';
    $('aCategorias').innerHTML = cats.map(c => '<button class="chip' + (c.id === st.agregar.categoria ? ' on' : '') + '">' + esc(c.nombre) + '</button>').join('') || '<span class="mut">No hay categorías activas</span>';
    $('aCategorias').querySelectorAll('.chip').forEach((b, i) => { b.onclick = () => { st.agregar.categoria = cats[i].id; pintarAgregar(); }; });
    actualizarAgregar();
  }

  let guardando = false;
  function actualizarAgregar() {
    const ok = digitos($('aMonto').value) && st.agregar.categoria && $('aFecha').value;
    $('aGuardar').disabled = !ok || guardando;
    $('aResumen').textContent = st.agregar.categoria ? nombreCat(st.agregar.categoria) + ' · ' + st.agregar.seccion : 'Elige una categoría';
  }

  $('aGuardar').onclick = () => {
    if (guardando) return;                       // evita el doble toque
    const monto = Number(digitos($('aMonto').value));
    if (!monto || !st.agregar.categoria) return;
    guardando = true; $('aGuardar').disabled = true; $('aGuardar').textContent = 'Guardando…';
    api.post('registrar', { fecha: $('aFecha').value, categoria_id: st.agregar.categoria, monto: monto, nota: $('aNota').value.trim() })
      .then(r => {
        $('aMonto').value = ''; $('aNota').value = ''; st.agregar.categoria = '';
        const f = r.movimiento.fecha;
        st.anio = Number(f.slice(0, 4)); st.mes = Number(f.slice(5, 7));
        st.panel = r.panel; st.movimientos = null;
        const queda = r.panel && !r.panel.sinPresupuesto ? ' · te quedan ' + pesos(r.panel.disponible) : '';
        toast('Guardado' + queda);
        irA('inicio');
      })
      .catch(e => toast(e.message, true))
      .then(() => { guardando = false; $('aGuardar').textContent = 'Guardar'; actualizarAgregar(); });
  };
  alEntrar.agregar = pintarAgregar;

  /* ───────── Pantalla Movimientos ───────── */
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  function pintarMovimientos() {
    $('mMesTxt').textContent = MESES[st.mes - 1].slice(0, 3) + ' ' + st.anio;
    if (!st.movimientos || st.movimientos.anio !== st.anio || st.movimientos.mes !== st.mes) {
      $('mLista').innerHTML = '<div class="cargando">Cargando…</div>';
      cargarMovimientos().then(() => { if (st.movimientos) pintarMovimientos(); });
      return;
    }
    const q = $('mBuscar').value.trim().toLowerCase();
    const lista = st.movimientos.lista.filter(m => !q || nombreCat(m.categoria_id).toLowerCase().indexOf(q) > -1 || String(m.nota).toLowerCase().indexOf(q) > -1);
    if (!lista.length) { $('mLista').innerHTML = '<div class="vacio">' + (q ? 'Nada coincide con "' + esc(q) + '"' : 'Sin movimientos este mes') + '</div>'; return; }
    const grupos = [];
    lista.forEach(m => { const g = grupos[grupos.length - 1]; if (g && g.fecha === m.fecha) g.items.push(m); else grupos.push({ fecha: m.fecha, items: [m] }); });
    $('mLista').innerHTML = grupos.map(g => {
      const d = new Date(Number(g.fecha.slice(0, 4)), Number(g.fecha.slice(5, 7)) - 1, Number(g.fecha.slice(8)));
      const total = g.items.reduce((a, m) => a + m.monto, 0);
      return '<div class="dia">' + DIAS[d.getDay()] + ' ' + d.getDate() + ' ' + MESES[d.getMonth()].slice(0, 3).toLowerCase() + ' · ' + pesos(total) + '</div><div class="grupo">' +
        g.items.map(m => {
          const c = st.catalogo && st.catalogo.categorias.find(x => x.id === m.categoria_id);
          return '<button class="mov" data-id="' + esc(m.id) + '"><div class="info"><div>' + esc(nombreCat(m.categoria_id)) + '</div><div>' +
            esc(c ? c.seccion : '') + (m.nota ? ' · ' + esc(m.nota) : '') + '</div></div><span class="m' + (m.monto < 0 ? ' neg' : '') + '">' + pesos(m.monto) + '</span></button>';
        }).join('') + '</div>';
    }).join('');
    $('mLista').querySelectorAll('.mov').forEach(b => { b.onclick = () => abrirEdicion(b.dataset.id); });
  }
  $('mBuscar').addEventListener('input', pintarMovimientos);
  alEntrar.movimientos = pintarMovimientos;

  /* Hoja de edición */
  function cerrarHoja() { $('hoja').classList.add('hidden'); }
  $('hoja').addEventListener('click', e => { if (e.target === $('hoja')) cerrarHoja(); });

  function abrirEdicion(id) {
    const m = st.movimientos.lista.find(x => x.id === id);
    if (!m) return;
    const cats = st.catalogo.categorias.filter(c => c.activa || c.id === m.categoria_id);
    const secs = [];
    cats.forEach(c => { if (secs.indexOf(c.seccion) < 0) secs.push(c.seccion); });
    $('hojaCaja').innerHTML = '<h2>Editar movimiento</h2><div class="card">' +
      '<label class="fila"><span class="lbl0">Monto</span><input id="eMonto" inputmode="numeric" value="' + pesos(m.monto) + '"></label>' +
      '<label class="fila"><span class="lbl0">Categoría</span><select id="eCategoria">' + secs.map(s => '<optgroup label="' + esc(s) + '">' +
        cats.filter(c => c.seccion === s).map(c => '<option value="' + esc(c.id) + '"' + (c.id === m.categoria_id ? ' selected' : '') + '>' + esc(c.nombre) + '</option>').join('') + '</optgroup>').join('') + '</select></label>' +
      '<label class="fila"><span class="lbl0">Fecha</span><input type="date" id="eFecha" value="' + m.fecha + '"></label>' +
      '<label class="fila"><span class="lbl0">Nota</span><input id="eNota" value="' + esc(m.nota) + '" placeholder="Opcional"></label></div>' +
      '<div class="botones"><button class="btn-sec btn-del" id="eBorrar">Borrar</button><button class="btn-pri" id="eGuardar" style="margin:0">Guardar</button></div>' +
      '<button class="btn-sec" id="eCancelar" style="width:100%;margin-top:10px">Cancelar</button>';
    $('hoja').classList.remove('hidden');
    $('eMonto').addEventListener('input', e => { const neg = /^\s*-/.test(e.target.value); const d = digitos(e.target.value); e.target.value = d ? (neg ? '-' : '') + pesos(d) : (neg ? '-' : ''); });
    $('eCancelar').onclick = cerrarHoja;

    $('eGuardar').onclick = () => {
      const montoTxt = $('eMonto').value, monto = (/^\s*-/.test(montoTxt) ? -1 : 1) * Number(digitos(montoTxt));
      const cambios = {};
      if (monto !== m.monto) cambios.monto = monto;
      if ($('eCategoria').value !== m.categoria_id) cambios.categoria_id = $('eCategoria').value;
      if ($('eFecha').value !== m.fecha) cambios.fecha = $('eFecha').value;
      if ($('eNota').value.trim() !== (m.nota || '')) cambios.nota = $('eNota').value.trim();
      if (!Object.keys(cambios).length) return cerrarHoja();
      $('eGuardar').disabled = true;
      api.post('editar', Object.assign({ id: m.id }, cambios))
        .then(r => { despuesDeCambio(r); toast('Cambios guardados'); cerrarHoja(); })
        .catch(e => { toast(e.message, true); $('eGuardar').disabled = false; });
    };

    let seguro = false;
    $('eBorrar').onclick = () => {
      if (!seguro) { seguro = true; $('eBorrar').textContent = '¿Seguro? Toca otra vez'; return; }
      $('eBorrar').disabled = true;
      api.post('borrar', { id: m.id })
        .then(r => { despuesDeCambio(r); toast('Movimiento borrado'); cerrarHoja(); })
        .catch(e => { toast(e.message, true); $('eBorrar').disabled = false; });
    };
  }

  function despuesDeCambio(r) {
    if (r.panel && r.panel.anio === st.anio && r.panel.mes === st.mes) st.panel = r.panel;
    st.movimientos = null;
    pintarMovimientos();
  }

  /* ───────── Historial ───────── */
  let historial = null;
  function pintarHistorial() {
    const sel = $('hAnio');
    if (!sel.options.length) {
      for (let y = hoy.getFullYear() - 3; y <= hoy.getFullYear() + 1; y++) sel.add(new Option(y, y));
      sel.value = st.anio;                       // abre en el año que estás mirando
    }
    if (!historial || historial.anio !== Number(sel.value)) {
      const anio = Number(sel.value);
      $('hLista').innerHTML = '<div class="cargando">Cargando…</div>';
      return api.get('historial', { anio: anio }).then(r => { historial = { anio: anio, meses: r.historial }; pintarHistorial(); })
        .catch(e => toast(e.message, true));
    }
    const H = historial.meses;
    const max = Math.max.apply(null, H.map(h => Math.max(h.gastado, h.gastado ? h.depositar : 0)).concat([1]));
    const ancho = 320 / 12;
    $('hGrafico').innerHTML = H.map((h, i) => {
      const alto = Math.round(h.gastado / max * 100), x = i * ancho + 5;
      const tope = h.gastado ? '<line class="tope" x1="' + (x - 2) + '" x2="' + (x + ancho - 6) + '" y1="' + (105 - Math.round(h.depositar / max * 100)) + '" y2="' + (105 - Math.round(h.depositar / max * 100)) + '"/>' : '';
      return '<rect class="b' + (h.gastado > h.depositar ? ' over' : '') + '" x="' + x + '" y="' + (105 - alto) + '" width="' + (ancho - 10) + '" height="' + alto + '" rx="2"/>' + tope +
        '<text x="' + (x + (ancho - 10) / 2) + '" y="117" text-anchor="middle">' + MESES[i].slice(0, 1) + '</text>';
    }).join('');
    const conDatos = H.filter(h => h.gastado).reverse();
    $('hLista').innerHTML = conDatos.length ? conDatos.map(h => {
      const dif = h.depositar - h.gastado;
      return '<button class="mov hmes" data-mes="' + h.mes + '"><div class="info"><div>' + MESES[h.mes - 1] + '</div><div>' + pesos(h.gastado) + ' de ' + pesos(h.depositar) + '</div></div>' +
        '<span class="m ' + (dif < 0 ? 'neg' : 'pos') + '">' + (dif >= 0 ? '+' : '') + pesos(dif) + '</span></button>';
    }).join('') : '<div class="vacio">Sin datos este año</div>';
    $('hLista').querySelectorAll('.hmes').forEach(b => {
      b.onclick = () => { st.anio = historial.anio; st.mes = Number(b.dataset.mes); st.sobreAbierto = null; irA('inicio'); };
    });
  }
  $('hAnio').onchange = () => { historial = null; pintarHistorial(); };
  alEntrar.historial = pintarHistorial;

  /* ───────── Ajustes ───────── */
  const TITULOS_AJ = { presupuesto: 'Presupuesto', categorias: 'Categorías', conexion: 'Conexión' };
  const ETIQ_TIPO = { ingreso: 'Ingreso', ahorro: 'Ahorro', fijo: 'Gasto fijo', variable: 'Gasto variable', deuda: 'Deuda' };
  document.querySelectorAll('[data-aj]').forEach(b => { b.onclick = () => abrirAjuste(b.dataset.aj); });
  $('ajVolver').onclick = () => abrirAjuste(null);
  alEntrar.ajustes = () => abrirAjuste(null);

  function abrirAjuste(cual) {
    $('ajMenu').classList.toggle('hidden', !!cual);
    $('ajVolver').classList.toggle('hidden', !cual);
    $('ajTitulo').textContent = cual ? TITULOS_AJ[cual] : 'Ajustes';
    Object.keys(TITULOS_AJ).forEach(k => $('aj-' + k).classList.toggle('hidden', k !== cual));
    if (cual === 'presupuesto') pintarPresupuesto();
    if (cual === 'categorias') pintarCategorias();
    if (cual === 'conexion') pintarConexion();
  }

  function seccionesDe(cats) {
    const s = [];
    cats.forEach(c => { if (s.indexOf(c.seccion) < 0) s.push(c.seccion); });
    return s;
  }

  /* Presupuesto del mes */
  function pintarPresupuesto() {
    const caja = $('aj-presupuesto');
    caja.innerHTML = '<div class="cargando">Cargando…</div>';
    const ref = { anio: st.anio, mes: st.mes };
    api.get('presupuesto', ref).then(r => {
      const items = r.items || {};
      const cats = st.catalogo.categorias.filter(c => c.activa || items[c.id]);
      const ingresos = cats.filter(c => c.tipo === 'ingreso'), gastos = cats.filter(c => TIPOS_GASTO.indexOf(c.tipo) > -1);
      const input = c => '<div class="it-t it"><span>' + esc(c.nombre) + '</span><input class="pres-in" data-id="' + esc(c.id) + '" inputmode="numeric" placeholder="sin tope" value="' + (items[c.id] ? pesos(items[c.id]) : '') + '"></div>';
      caja.innerHTML =
        '<p class="mut peq" style="margin:0 4px 10px">' + MESES[ref.mes - 1] + ' ' + ref.anio + ' · cambia el mes en Inicio</p>' +
        '<button class="btn-sec" id="pCopiar" style="width:100%;margin-bottom:14px">Copiar del mes anterior</button>' +
        '<div class="card"><p class="lbl">Ingresos esperados</p>' + ingresos.map(input).join('') +
        '<div class="it-t it"><span>Colchón</span><input class="pres-in" id="pColchon" inputmode="numeric" value="' + pesos(r.colchon) + '"></div></div>' +
        seccionesDe(gastos).map(s => '<div class="card"><p class="lbl">' + esc(s) + '</p>' + gastos.filter(c => c.seccion === s).map(input).join('') + '</div>').join('') +
        '<div class="card total"><span>Total a depositar</span><span id="pTotal"></span></div>' +
        '<button class="btn-pri" id="pGuardar">Guardar presupuesto</button>';
      const recalcular = () => {
        let t = Number(digitos($('pColchon').value)) || 0;
        caja.querySelectorAll('.pres-in[data-id]').forEach(i => {
          const c = st.catalogo.categorias.find(x => x.id === i.dataset.id);
          if (c && TIPOS_GASTO.indexOf(c.tipo) > -1) t += Number(digitos(i.value)) || 0;
        });
        $('pTotal').textContent = pesos(t);
      };
      caja.querySelectorAll('.pres-in').forEach(i => i.addEventListener('input', () => { const d = digitos(i.value); i.value = d ? pesos(d) : ''; recalcular(); }));
      recalcular();
      $('pGuardar').onclick = () => {
        const nuevos = Object.assign({}, items);               // conserva topes de categorías no mostradas (ej. ahorro)
        caja.querySelectorAll('.pres-in[data-id]').forEach(i => { const v = Number(digitos(i.value)); if (v) nuevos[i.dataset.id] = v; else delete nuevos[i.dataset.id]; });
        $('pGuardar').disabled = true;
        api.post('guardarPresupuesto', { anio: ref.anio, mes: ref.mes, items: nuevos, colchon: Number(digitos($('pColchon').value)) || 0 })
          .then(() => { toast('Presupuesto guardado'); st.panel = null; cargarInicio(); })
          .catch(e => toast(e.message, true)).then(() => { $('pGuardar').disabled = false; });
      };
      $('pCopiar').onclick = () => {
        api.post('copiarPresupuesto', ref).then(() => { toast('Copiado del mes anterior'); st.panel = null; cargarInicio(); pintarPresupuesto(); })
          .catch(e => toast(e.message, true));
      };
    }).catch(e => { caja.innerHTML = '<div class="vacio">' + esc(e.message) + '</div>'; });
  }

  /* Categorías */
  function pintarCategorias() {
    const cats = st.catalogo.categorias;
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

  function guardarCat(datos, msg) {
    return api.post('guardarCategoria', datos).then(r => {
      st.catalogo = r.catalogo;
      pintarCategorias(); pintarAgregar();
      if (msg) toast(msg);
    }).catch(e => toast(e.message, true));
  }

  function moverCategoria(c, dir) {
    const deSec = st.catalogo.categorias.filter(x => x.seccion === c.seccion);
    const i = deSec.indexOf(c), j = dir === 'arriba' ? i - 1 : i + 1;
    if (j < 0 || j >= deSec.length) return;
    const otra = deSec[j];
    let oc = c.orden, oo = otra.orden;
    if (oc === oo) oo = dir === 'arriba' ? oc - 1 : oc + 1;   // por si tenían el mismo orden
    api.post('guardarCategoria', { id: c.id, orden: oo })
      .then(() => guardarCat({ id: otra.id, orden: oc }));
  }

  function editarCategoria(c) {
    const cats = st.catalogo.categorias, secs = seccionesDe(cats);
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
      let datos;
      if (!c) datos = { nombre: nombre, seccion: seccion, tipo: tipo };
      else {
        datos = { id: c.id };
        if (nombre !== c.nombre) datos.nombre = nombre;
        if (seccion !== c.seccion) datos.seccion = seccion;
        if (tipo !== c.tipo) datos.tipo = tipo;
        if (Object.keys(datos).length === 1) return cerrarHoja();
      }
      $('kGuardar').disabled = true;
      guardarCat(datos, c ? 'Categoría actualizada' : 'Categoría creada').then(cerrarHoja);
    };
  }

  /* Conexión */
  function pintarConexion() {
    $('aj-conexion').innerHTML = '<div class="card">' +
      '<label class="campo"><span>URL del script</span><input id="xUrl" value="' + esc(st.url) + '" autocapitalize="off" autocorrect="off" spellcheck="false"></label>' +
      '<label class="campo"><span>Clave</span><input id="xClave" type="password" value="' + esc(st.token) + '"></label></div>' +
      '<button class="btn-pri" id="xGuardar">Guardar conexión</button>' +
      '<button class="link" id="xSalir" style="color:var(--err)">Desconectar este teléfono</button>';
    $('xGuardar').onclick = () => {
      const url = $('xUrl').value.trim().split('?')[0], token = $('xClave').value.trim();
      if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) return toast('La URL debe terminar en /exec', true);
      api.get('inicio', { anio: st.anio, mes: st.mes }, url, token).then(r => {
        st.url = url; st.token = token; LS.set('g_url', url); LS.set('g_token', token);
        recibirInicio(r); toast('Conexión guardada');
      }).catch(e => toast(e.message, true));
    };
    $('xSalir').onclick = () => {
      ['g_url', 'g_token', 'g_inicio'].forEach(LS.del);
      st.url = ''; st.token = ''; st.panel = null; st.catalogo = null; st.movimientos = null;
      $('vApp').classList.add('hidden'); $('vConectar').classList.remove('hidden');
    };
  }

  /* ───────── Arranque ───────── */
  if (!st.url || !st.token) {
    $('vConectar').classList.remove('hidden');
  } else {
    $('vApp').classList.remove('hidden');
    irA('inicio');
  }
})();
