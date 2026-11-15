"""Pruebas de humo de la interfaz (iPhone 390x844) con la API simulada.

Uso:  python3 tests/ui_smoke.py            (todas)
      python3 tests/ui_smoke.py inicio     (solo las que contienen 'inicio')
Las capturas quedan en tests/__capturas__/ (ignorado por git).
"""
import json, os, subprocess, sys, traceback
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAPT = os.path.join(RAIZ, 'tests', '__capturas__')
os.makedirs(CAPT, exist_ok=True)
DATOS = json.loads(subprocess.check_output(['node', os.path.join(RAIZ, 'tests', 'ui-datos.js')], env=dict(os.environ, TZ='America/Santiago')))

STUB = """
(() => {
  const D = %s;
  window.__posts = [];
  window.__gets = [];
  window.__lento = 0;
  window.__offline = false;
  try { if (%s) { localStorage.setItem('g_url', 'https://script.google.com/macros/s/x/exec'); localStorage.setItem('g_token', 't'); } } catch (e) {}
  window.fetch = (url, o) => {
    if (window.__offline) return Promise.reject(new TypeError('Failed to fetch'));
    const resp = obj => new Promise(r => setTimeout(() => r({ ok: true, text: () => Promise.resolve(JSON.stringify(obj)) }), window.__lento));
    if (o && o.method === 'POST') {
      const b = JSON.parse(o.body); window.__posts.push(b);
      // El servidor simulado guarda los cambios (como el real) para que la recarga los traiga
      const X = D.datos;
      if (b.accion === 'registrar' && !X.movimientos.some(m => m.id === b.id)) X.movimientos.push({ id: b.id, fecha: b.fecha, categoria_id: b.categoria_id, monto: b.monto, nota: b.nota || '', origen: 'app' });
      if (b.accion === 'borrar') X.movimientos = X.movimientos.filter(m => m.id !== b.id);
      if (b.accion === 'editar') { const m = X.movimientos.find(x => x.id === b.id); if (m) ['fecha', 'categoria_id', 'monto', 'nota'].forEach(k => { if (b[k] !== undefined) m[k] = b[k]; }); }
      if (b.accion === 'guardarPresupuesto') X.presupuestos[b.mes] = Object.assign({}, b.items, { _colchon: b.colchon });
      if (b.accion === 'guardarMeta') { const i = X.metas.findIndex(m => m.id === b.id); const m = Object.assign({ acumuladoAntes: 0, activa: true, inicial: 0, categorias: [] }, i > -1 ? X.metas[i] : {}, b); delete m.accion; delete m.token; if (i > -1) X.metas[i] = m; else X.metas.push(m); }
      if (b.accion === 'borrarMeta') X.metas = X.metas.filter(m => m.id !== b.id);
      if (b.accion === 'copiarPresupuesto') X.presupuestos[b.mes] = Object.assign({}, X.presupuestos[b.mes - 1]);
      if (b.accion === 'registrar') return resp({ ok: true, movimiento: Object.assign({ id: 'nuevo' }, b), panel: D.inicio.panel });
      if (b.accion === 'guardarCategoria') {
        const cats = D.inicio.catalogo.categorias;
        let c = cats.find(x => x.id === b.id);
        const datos = Object.assign({}, b); delete datos.accion; delete datos.token;
        if (c) Object.assign(c, datos); else { c = Object.assign({ id: 'nueva', activa: true, orden: 99 }, datos); cats.push(c); }
        cats.sort((x, y) => x.orden - y.orden);
        const c2 = D.datos.categorias.find(x => x.id === c.id);
        if (c2) Object.assign(c2, datos); else D.datos.categorias.push(Object.assign({}, c));
        D.datos.categorias.sort((x, y) => x.orden - y.orden);
        return resp({ ok: true, categoria: c, catalogo: D.inicio.catalogo });
      }
      if (b.accion === 'guardarPresupuesto' || b.accion === 'copiarPresupuesto') return resp(Object.assign({ ok: true }, D.presupuesto));
      return resp({ ok: true, panel: D.inicio.panel });
    }
    const q = new URL(url).searchParams; window.__gets.push(Object.fromEntries(q));
    const acc = q.get('accion');
    if (acc === 'datos') return resp(q.get('anio') === '2026' ? D.datos : { ok: true, anio: Number(q.get('anio')), categorias: D.datos.categorias, movimientos: [], presupuestos: {}, colchonDefault: 250000 });
    if (acc === 'inicio') return resp(q.get('mes') === '9' ? D.inicioSinPres : D.inicio);
    if (acc === 'movimientos') return resp(D.movimientos);
    if (acc === 'presupuesto') return resp(D.presupuesto);
    if (acc === 'historial') return resp(D.historial);
    return resp({ ok: false, msg: 'Acción desconocida' });
  };
})();
"""

PRUEBAS = []
def prueba(fn):
    PRUEBAS.append(fn); return fn

def abrir(browser, conectado=True):
    pg = browser.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    pg.set_default_timeout(2500)
    pg.errores = []
    pg.on('pageerror', lambda e: pg.errores.append(str(e)))
    pg.clock.set_fixed_time('2026-11-14T12:00:00-03:00')
    pg.add_init_script(STUB % (json.dumps(DATOS), 'true' if conectado else 'false'))
    pg.goto('file://' + os.path.join(RAIZ, 'index.html'))
    pg.wait_for_timeout(300)
    return pg

def nav(pg, s):
    pg.click('.nav [data-s="%s"]' % s); pg.wait_for_timeout(150)

def posts(pg, accion=None):
    return [p for p in pg.evaluate('window.__posts') if accion is None or p['accion'] == accion]

# ───────── Task 7: conectar, inicio, agregar ─────────

@prueba
def conectar_sin_configuracion(b):
    pg = abrir(b, conectado=False)
    assert pg.is_visible('#vConectar'), 'debe pedir URL y clave'
    pg.fill('#cUrl', 'https://script.google.com/macros/s/abc/exec'); pg.fill('#cClave', 't')
    pg.click('#cConectar'); pg.wait_for_timeout(300)
    assert pg.is_visible('#s-inicio')
    return pg

@prueba
def inicio_anillo_y_sobres(b):
    pg = abrir(b)
    p = DATOS['inicio']['panel']
    assert pg.inner_text('#anilloMonto') == '$67.000', pg.inner_text('#anilloMonto')
    assert '70%' in pg.inner_text('#anilloPct'), pg.inner_text('#anilloPct')
    meta = pg.inner_text('#inicioMeta')
    assert '17 días' in meta and '$3.941' in meta, meta
    estados = pg.eval_on_selector_all('.sobre', 'els => els.map(e => [e.querySelector(".sobre-nombre").textContent, e.dataset.estado])')
    assert estados == [[s['seccion'], s['estado']] for s in p['sobres']], estados
    assert estados[0] == ['Gastos Fijos', 'pasado']
    pg.click('.sobre >> nth=3'); pg.wait_for_timeout(150)
    det = pg.inner_text('#sobreDetalle')
    assert 'Supermercado' in det and '$55.000' in det and 'sin tope' in det, det
    pg.screenshot(path=os.path.join(CAPT, 'inicio.png'), full_page=True)
    return pg

@prueba
def inicio_sin_presupuesto(b):
    pg = abrir(b)
    pg.select_option('#iMes', '9'); pg.wait_for_timeout(300)
    assert pg.is_visible('#sinPres'), 'debe avisar que no hay presupuesto'
    assert 'Sin presupuesto este mes' in pg.inner_text('#sinPres')
    return pg

@prueba
def agregar_un_solo_post_con_doble_toque(b):
    pg = abrir(b)
    nav(pg, 'agregar')
    pg.fill('#aMonto', '12500')
    assert pg.input_value('#aMonto') == '$12.500'
    pg.click('#aSecciones .chip:has-text("Comida")')
    nombres = pg.eval_on_selector_all('#aCategorias .chip', 'els => els.map(e => e.textContent)')
    assert 'Café' not in nombres, 'categoría inactiva no debe aparecer'
    pg.click('#aCategorias .chip:has-text("Supermercado")')
    pg.fill('#aNota', 'almuerzo')
    pg.evaluate('window.__lento = 400')
    pg.evaluate("(() => { const b = document.getElementById('aGuardar'); b.click(); b.click(); })()")   # doble toque
    pg.wait_for_timeout(700)
    r = posts(pg, 'registrar')
    assert len(r) == 1, r
    assert r[0]['categoria_id'] == 'sup' and r[0]['monto'] == 12500 and r[0]['nota'] == 'almuerzo', r[0]
    assert len(r[0]['fecha']) == 10
    assert 'te quedan' in pg.inner_text('#toast').lower()
    assert pg.is_visible('#s-inicio')
    pg.screenshot(path=os.path.join(CAPT, 'agregar.png'))
    return pg

@prueba
def agregar_tipo_ingreso_muestra_solo_ingresos(b):
    pg = abrir(b)
    nav(pg, 'agregar')
    pg.click('.chip-tipo:has-text("Ingreso")')
    secs = pg.eval_on_selector_all('#aSecciones .chip', 'els => els.map(e => e.textContent)')
    assert secs == ['Ingresos'], secs
    return pg

# ───────── Task 8: movimientos e historial ─────────

@prueba
def movimientos_agrupados_y_busqueda(b):
    pg = abrir(b)
    nav(pg, 'movimientos'); pg.wait_for_timeout(200)
    assert pg.locator('.grupo').count() == 7, pg.locator('.grupo').count()
    assert pg.locator('.mov').count() == 8
    primero = pg.inner_text('.dia >> nth=0').lower()
    assert '9' in primero and 'nov' in primero, primero
    pg.fill('#mBuscar', 'feria'); pg.wait_for_timeout(100)
    assert pg.locator('.mov').count() == 1
    pg.fill('#mBuscar', 'bencina'); pg.wait_for_timeout(100)
    assert pg.locator('.mov').count() == 1
    pg.fill('#mBuscar', ''); pg.wait_for_timeout(100)
    pg.screenshot(path=os.path.join(CAPT, 'movimientos.png'))
    return pg

@prueba
def editar_envia_solo_lo_cambiado(b):
    pg = abrir(b)
    nav(pg, 'movimientos'); pg.wait_for_timeout(200)
    pg.click('.mov[data-id="m4"]'); pg.wait_for_timeout(100)
    assert pg.is_visible('#hoja')
    assert pg.input_value('#eMonto') == '$40.000'
    pg.screenshot(path=os.path.join(CAPT, 'editar.png'))
    pg.fill('#eMonto', '41000')
    pg.click('#eGuardar'); pg.wait_for_timeout(300)
    e = posts(pg, 'editar')
    assert e == [{'accion': 'editar', 'token': 't', 'id': 'm4', 'monto': 41000}], e
    assert not pg.is_visible('#hoja')
    return pg

@prueba
def borrar_pide_confirmacion(b):
    pg = abrir(b)
    nav(pg, 'movimientos'); pg.wait_for_timeout(200)
    pg.click('.mov[data-id="m7"]'); pg.wait_for_timeout(100)
    pg.click('#eBorrar'); pg.wait_for_timeout(100)
    assert posts(pg, 'borrar') == []
    assert 'Seguro' in pg.inner_text('#eBorrar')
    pg.click('#eBorrar'); pg.wait_for_timeout(300)
    assert [p['id'] for p in posts(pg, 'borrar')] == ['m7']
    return pg

@prueba
def historial_barras_y_salto_a_mes(b):
    pg = abrir(b)
    nav(pg, 'historial'); pg.wait_for_timeout(300)
    assert pg.input_value('#hAnio') == '2026', pg.input_value('#hAnio')
    assert pg.locator('#hGrafico rect.b').count() == 12
    filas = pg.locator('#hLista .hmes')
    assert filas.count() >= 2, filas.count()
    nov = pg.inner_text('#hLista .hmes[data-mes="11"]')
    assert '$153.000' in nov and '+$67.000' in nov, nov
    pg.screenshot(path=os.path.join(CAPT, 'historial.png'), full_page=True)
    pg.click('#hLista .hmes[data-mes="10"]'); pg.wait_for_timeout(300)
    assert pg.is_visible('#s-inicio')
    assert pg.input_value('#iMes') == '10'
    return pg

# ───────── Task 9: ajustes ─────────

def ajuste(pg, cual):
    nav(pg, 'ajustes'); pg.click('[data-aj="%s"]' % cual); pg.wait_for_timeout(300)

@prueba
def presupuesto_total_en_vivo_guardar_y_copiar(b):
    pg = abrir(b)
    ajuste(pg, 'presupuesto')
    assert pg.input_value('.pres-in[data-id="luz"]') == '$25.000'
    assert pg.input_value('#pColchon') == '$100.000'
    assert pg.input_value('.pres-in[data-id="sue"]') == '$1.000.000'
    assert pg.inner_text('#pTotal') == '$220.000', pg.inner_text('#pTotal')
    pg.fill('.pres-in[data-id="luz"]', '30000'); pg.wait_for_timeout(50)
    assert pg.inner_text('#pTotal') == '$225.000', pg.inner_text('#pTotal')
    pg.fill('.pres-in[data-id="sup"]', '200000')
    pg.screenshot(path=os.path.join(CAPT, 'presupuesto.png'), full_page=True)
    pg.click('#pGuardar'); pg.wait_for_timeout(300)
    g = posts(pg, 'guardarPresupuesto')
    assert len(g) == 1 and g[0]['anio'] == 2026 and g[0]['mes'] == 11, g
    assert g[0]['items']['luz'] == 30000 and g[0]['items']['sup'] == 200000 and g[0]['items']['sue'] == 1000000, g[0]['items']
    assert g[0]['colchon'] == 100000
    # Noviembre: octubre no tiene presupuesto → avisa sin enviar nada
    pg.click('#pCopiar'); pg.wait_for_timeout(200)
    assert posts(pg, 'copiarPresupuesto') == []
    assert 'no tiene presupuesto' in pg.inner_text('#toast')
    # Diciembre: copia lo de noviembre y se ve al instante
    nav(pg, 'inicio'); pg.select_option('#iMes', '12')
    ajuste(pg, 'presupuesto')
    pg.click('#pCopiar'); pg.wait_for_timeout(300)
    assert [(p['anio'], p['mes']) for p in posts(pg, 'copiarPresupuesto')] == [(2026, 12)]
    assert pg.input_value('.pres-in[data-id="luz"]') == '$30.000', pg.input_value('.pres-in[data-id="luz"]')
    return pg

@prueba
def categorias_crear_renombrar_mover_ordenar_desactivar(b):
    pg = abrir(b)
    ajuste(pg, 'categorias')
    assert pg.locator('.cat-row').count() == 7
    pg.screenshot(path=os.path.join(CAPT, 'categorias.png'), full_page=True)
    # crear
    pg.click('#cNueva'); pg.wait_for_timeout(100)
    pg.fill('#kNombre', 'Delivery'); pg.select_option('#kSeccion', 'Comida'); pg.select_option('#kTipo', 'variable')
    pg.click('#kGuardar'); pg.wait_for_timeout(300)
    nueva = posts(pg, 'guardarCategoria')[-1]
    assert {k: nueva[k] for k in ('nombre', 'seccion', 'tipo')} == {'nombre': 'Delivery', 'seccion': 'Comida', 'tipo': 'variable'} and len(nueva['id']) == 8, nueva
    assert pg.locator('.cat-row:has-text("Delivery")').count() == 1
    # renombrar y mover de sección
    pg.click('.cat-row[data-id="caf"] .nom'); pg.wait_for_timeout(100)
    pg.fill('#kNombre', 'Cafetería'); pg.select_option('#kSeccion', 'Transporte')
    pg.click('#kGuardar'); pg.wait_for_timeout(300)
    assert posts(pg, 'guardarCategoria')[-1] == {'accion': 'guardarCategoria', 'token': 't', 'id': 'caf', 'nombre': 'Cafetería', 'seccion': 'Transporte'}, posts(pg)[-1]
    # ordenar: subir Bencina intercambia orden con la anterior
    antes = len(posts(pg, 'guardarCategoria'))
    pg.click('.cat-row[data-id="ben"] .ord[data-dir="arriba"]'); pg.wait_for_timeout(400)
    nuevos = posts(pg, 'guardarCategoria')[antes:]
    assert len(nuevos) == 2 and {n['id'] for n in nuevos} == {'ben', 'caf'}, nuevos   # dentro de Transporte, Cafetería quedó antes
    # desactivar Bencina → ya no aparece en Agregar
    pg.click('.cat-row[data-id="ben"] .act'); pg.wait_for_timeout(300)
    assert posts(pg, 'guardarCategoria')[-1] == {'accion': 'guardarCategoria', 'token': 't', 'id': 'ben', 'activa': False}
    pg.click('.cat-row[data-id="caf"] .act'); pg.wait_for_timeout(300)      # Café venía inactiva: activarla
    assert posts(pg, 'guardarCategoria')[-1] == {'accion': 'guardarCategoria', 'token': 't', 'id': 'caf', 'activa': True}
    nav(pg, 'agregar')
    pg.click('#aSecciones .chip:has-text("Transporte")'); pg.wait_for_timeout(100)
    cats = pg.eval_on_selector_all('#aCategorias .chip', 'els => els.map(e => e.textContent)')
    assert 'Bencina' not in cats and 'Cafetería' in cats, cats
    return pg

@prueba
def conexion_cambiar_y_desconectar(b):
    pg = abrir(b)
    ajuste(pg, 'conexion')
    assert pg.input_value('#xUrl') == 'https://script.google.com/macros/s/x/exec'
    pg.fill('#xUrl', 'https://script.google.com/macros/s/otra/exec'); pg.fill('#xClave', 't2')
    pg.click('#xGuardar'); pg.wait_for_timeout(300)
    assert pg.evaluate("localStorage.getItem('g_url')") == 'https://script.google.com/macros/s/otra/exec'
    assert pg.evaluate("localStorage.getItem('g_token')") == 't2'
    pg.click('#xSalir'); pg.wait_for_timeout(100)
    assert pg.is_visible('#vConectar')
    return pg

# ───────── Versión rápida ─────────

def gets(pg):
    return pg.evaluate('window.__gets.length')

@prueba
def rapida_navegar_no_llama_al_servidor(b):
    pg = abrir(b)
    n = gets(pg)
    for s_ in ('movimientos', 'historial', 'agregar', 'inicio', 'movimientos'):
        nav(pg, s_)
    pg.select_option('#iMes', '10') if pg.is_visible('#iMes') else None
    ajuste(pg, 'presupuesto')
    assert gets(pg) == n, 'hubo %d llamadas al navegar' % (gets(pg) - n)
    return pg

@prueba
def rapida_guardar_actualiza_al_instante(b):
    pg = abrir(b)
    pg.evaluate('window.__lento = 3000')
    nav(pg, 'agregar')
    pg.fill('#aMonto', '12500')
    pg.click('#aSecciones .chip:has-text("Comida")'); pg.click('#aCategorias .chip:has-text("Supermercado")')
    pg.click('#aGuardar'); pg.wait_for_timeout(150)
    assert pg.is_visible('#s-inicio')
    assert pg.inner_text('#anilloMonto') == '$54.500', pg.inner_text('#anilloMonto')
    assert 'te quedan $54.500' in pg.inner_text('#toast').lower(), pg.inner_text('#toast')
    nav(pg, 'movimientos')
    assert pg.locator('.mov').count() == 9
    return pg

@prueba
def rapida_sin_senal_queda_pendiente_y_se_envia(b):
    pg = abrir(b)
    pg.evaluate('window.__offline = true')
    nav(pg, 'agregar')
    pg.fill('#aMonto', '3000')
    pg.click('#aSecciones .chip:has-text("Comida")'); pg.click('#aCategorias .chip:has-text("Supermercado")')
    pg.click('#aGuardar'); pg.wait_for_timeout(300)
    assert pg.inner_text('#anilloMonto') == '$64.000', pg.inner_text('#anilloMonto')
    assert '1 pendiente' in pg.inner_text('#sync'), pg.inner_text('#sync')
    assert pg.evaluate("JSON.parse(localStorage.getItem('g_cola')).length") == 1
    pg.evaluate("window.__offline = false; window.dispatchEvent(new Event('online'))"); pg.wait_for_timeout(500)
    assert [p['monto'] for p in posts(pg, 'registrar')] == [3000]
    assert not pg.is_visible('#sync'), pg.inner_text('#sync')
    return pg

@prueba
def rapida_abre_con_datos_guardados_sin_esperar(b):
    pg = abrir(b)
    pg.evaluate('window.__lento = 5000')
    pg.reload(); pg.wait_for_timeout(200)
    assert pg.is_visible('#iPanel'), 'debe mostrar lo guardado sin esperar a la red'
    assert pg.inner_text('#anilloMonto') == '$67.000'
    return pg

@prueba
def rapida_sincronizar_no_borra_lo_que_escribes(b):
    pg = abrir(b)
    ajuste(pg, 'presupuesto')
    pg.fill('.pres-in[data-id="luz"]', '99999')
    pg.evaluate("window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange'))"); pg.wait_for_timeout(400)
    assert pg.input_value('.pres-in[data-id="luz"]') == '$99.999', pg.input_value('.pres-in[data-id="luz"]')
    assert pg.is_visible('#aj-presupuesto')
    return pg

# ───────── Tendencias, metas ─────────

@prueba
def tendencias_y_proyeccion(b):
    pg = abrir(b)
    t = pg.inner_text('#tendencias')
    assert 'Supermercado' in t and '44%' in t, t
    assert 'te pasarías' in t and '$22.143' in t and '$242.143' in t, t
    pg.screenshot(path=os.path.join(CAPT, 'tendencias.png'), full_page=True)
    return pg

@prueba
def metas_en_inicio(b):
    pg = abrir(b)
    t = pg.inner_text('#metas')
    assert 'Viaje' in t and '$150.000' in t and '15%' in t and '$170.000' in t, t
    return pg

@prueba
def metas_crear_editar_borrar(b):
    pg = abrir(b)
    ajuste(pg, 'metas')
    assert pg.locator('.meta-row').count() == 1
    pg.click('#gNueva'); pg.wait_for_timeout(100)
    pg.fill('#gNombre', 'Fondo emergencia'); pg.fill('#gObjetivo', '2000000'); pg.fill('#gInicial', '500000')
    pg.fill('#gLimite', '2027-12-31')
    pg.check('.gCat[value="fin"]')
    pg.click('#gGuardar'); pg.wait_for_timeout(300)
    m = posts(pg, 'guardarMeta')[-1]
    assert m['nombre'] == 'Fondo emergencia' and m['objetivo'] == 2000000 and m['inicial'] == 500000, m
    assert m['fecha_limite'] == '2027-12-31' and m['categorias'] == ['fin'] and m['desde'] == '2026-11-14' and len(m['id']) == 8, m
    assert pg.locator('.meta-row').count() == 2
    nav(pg, 'inicio')
    assert 'Fondo emergencia' in pg.inner_text('#metas')
    ajuste(pg, 'metas')
    pg.click('.meta-row:has-text("Viaje")'); pg.wait_for_timeout(100)
    pg.fill('#gObjetivo', '1200000'); pg.click('#gGuardar'); pg.wait_for_timeout(300)
    assert posts(pg, 'guardarMeta')[-1]['objetivo'] == 1200000
    pg.click('.meta-row:has-text("Viaje")'); pg.wait_for_timeout(100)
    pg.click('#gBorrar'); assert posts(pg, 'borrarMeta') == []
    pg.click('#gBorrar'); pg.wait_for_timeout(300)
    assert [p['id'] for p in posts(pg, 'borrarMeta')] == ['meta0001']
    assert pg.locator('.meta-row').count() == 1
    pg.screenshot(path=os.path.join(CAPT, 'metas.png'))
    return pg

# ───────── Sin internet (service worker; necesita http, no file://) ─────────

@prueba
def sin_internet_abre_igual(b):
    import http.server, threading, functools, socketserver
    Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=RAIZ)
    Handler.log_message = lambda *a: None
    srv = socketserver.TCPServer(('127.0.0.1', 0), Handler); puerto = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        ctx = b.new_context(viewport={'width': 390, 'height': 844})
        pg = ctx.new_page(); pg.errores = []
        pg.on('pageerror', lambda e: pg.errores.append(str(e)))
        pg.set_default_timeout(4000)
        pg.add_init_script(STUB % (json.dumps(DATOS), 'true'))
        pg.goto('http://127.0.0.1:%d/index.html' % puerto)
        pg.wait_for_timeout(800)
        pg.reload(); pg.wait_for_timeout(800)
        assert pg.evaluate('!!(navigator.serviceWorker && navigator.serviceWorker.controller)'), 'el service worker no tomó control'
        ctx.set_offline(True)
        pg.reload(); pg.wait_for_timeout(500)
        assert pg.is_visible('#iPanel'), 'sin internet no abrió'
        assert pg.inner_text('#anilloMonto') == '$67.000'
        ctx.set_offline(False)
        return pg
    finally:
        srv.shutdown()

# ───────── Fluidez y presupuesto con mes anterior ─────────

@prueba
def pestana_cambia_al_apoyar_el_dedo(b):
    pg = abrir(b)
    pg.evaluate("""document.querySelector('.nav [data-s="historial"]').dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}))""")
    assert pg.is_visible('#s-historial'), 'debe cambiar en pointerdown, sin esperar el click'
    return pg

@prueba
def ajustes_muestra_version(b):
    pg = abrir(b)
    nav(pg, 'ajustes')
    v = pg.inner_text('#version')
    assert v.startswith('Versión ') and len(v) > 9, v
    return pg

@prueba
def presupuesto_muestra_lo_gastado_el_mes_anterior(b):
    pg = abrir(b)
    ajuste(pg, 'presupuesto')
    assert pg.inner_text('.pres-ant[data-id="sup"]') == 'oct $99.000', pg.inner_text('.pres-ant[data-id="sup"]')
    assert pg.inner_text('.pres-ant[data-id="luz"]') == 'oct —'
    assert 'oct $99.000' in pg.inner_text('.pres-sec[data-sec="Comida"]'), pg.inner_text('.pres-sec[data-sec="Comida"]')
    pg.screenshot(path=os.path.join(CAPT, 'presupuesto-anterior.png'), full_page=True)
    return pg

@prueba
def presupuesto_enero_mira_diciembre_del_anio_anterior(b):
    pg = abrir(b)
    pg.select_option('#iAnio', '2027'); pg.select_option('#iMes', '1'); pg.wait_for_timeout(300)
    ajuste(pg, 'presupuesto'); pg.wait_for_timeout(300)
    assert pg.inner_text('.pres-ant[data-id="sup"]') == 'dic —', pg.inner_text('.pres-ant[data-id="sup"]')
    return pg

def main():
    filtro = sys.argv[1] if len(sys.argv) > 1 else ''
    fallas = 0
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--no-proxy-server'])
        for fn in PRUEBAS:
            if filtro not in fn.__name__: continue
            try:
                pg = fn(b)
                assert not pg.errores, 'errores JS: %s' % pg.errores
                print('ok    ', fn.__name__)
            except Exception:
                fallas += 1
                print('FALLA ', fn.__name__); traceback.print_exc(limit=2)
        b.close()
    print('\n%d fallas' % fallas)
    sys.exit(1 if fallas else 0)

if __name__ == '__main__':
    main()
