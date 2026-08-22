/* ============================================================
   CotizaPro — Base de datos con Google Sheets
   Todos los datos se guardan en una hoja de cálculo compartida.
   ============================================================ */

const GOOGLE_CLIENT_ID = '499971275123-ai582md3haki95d9a71qki7iskj1nvab.apps.googleusercontent.com';
const DRIVE_SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive';
const SPREADSHEET_NAME = 'CotizaPro_BaseDatos';

const SHEETS = {
  clientes: 'Clientes',
  productos: 'Productos',
  cotizaciones: 'Cotizaciones',
  detalleCotizacion: 'DetalleCotizacion',
  configuracionEmpresa: 'Configuracion',
  usuarios: 'Usuarios'
};

const SHEET_HEADERS = {
  Clientes: ['id','nombre','rtn','telefono','email','direccion','contacto','fechaRegistro','fechaModificacion'],
  Productos: ['id','codigo','categoria','nombre','marca','modelo','descripcion','precioCompra','precioVenta','costoInstalacion','impuesto','estado','imagen','stock','fechaRegistro','fechaModificacion'],
  Cotizaciones: ['id','numero','fechaCreacion','fechaVencimiento','clienteId','vendedor','estado','subtotal','descuento','impuesto','manoObra','transporte','materialesAdicionales','otrosCostos','total','alcanceProyecto','observaciones','firmaCliente','fechaFirma','fechaModificacion'],
  DetalleCotizacion: ['id','cotizacionId','productoId','codigo','nombre','descripcion','cantidad','precioUnitario','precioCompra','descuentoPorcentaje','subtotal','cargoMensual','margen'],
  Configuracion: ['id','nombreEmpresa','rtnEmpresa','direccionEmpresa','telefonoEmpresa','emailEmpresa','logoEmpresa','porcentajeImpuesto','diasVigencia','observacionesDefault'],
  Usuarios: ['id','nombre','email','rol','activo']
};

let gAccessToken = sessionStorage.getItem('cotizapro_token') || null;
let gAuthenticated = !!gAccessToken;
let gSpreadsheetId = null;
let gDataCache = {};
let gReady = false;

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

/* ============ AUTH ============ */

async function cargarScriptGoogle() {
  return new Promise((resolve) => {
    if (window.google && window.google.accounts) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = resolve;
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

async function iniciarSesion() {
  await cargarScriptGoogle();
  return new Promise((resolve, reject) => {
    if (!window.google || !window.google.accounts) {
      return reject(new Error('Google Identity Services no disponible'));
    }
    const tc = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPES,
      callback: (r) => {
        gAccessToken = r.access_token;
        gAuthenticated = true;
        sessionStorage.setItem('cotizapro_token', r.access_token);
        resolve(r);
      },
      error_callback: (e) => reject(e)
    });
    tc.requestAccessToken();
  });
}

function cerrarSesion() {
  if (gAccessToken) {
    try { google.accounts.oauth2.revoke(gAccessToken); } catch (e) {}
    gAccessToken = null;
    gAuthenticated = false;
    gReady = false;
    gSpreadsheetId = null;
    gDataCache = {};
    sessionStorage.removeItem('cotizapro_token');
  }
}

function estaAutenticado() { return gAuthenticated && !!gAccessToken; }

/* ============ GOOGLE API HELPERS ============ */

async function apiFetch(url, options = {}) {
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Authorization': 'Bearer ' + gAccessToken,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`API Error ${resp.status}: ${txt}`);
  }
  return resp.json();
}

/* ============ SPREADSHEET ============ */

async function buscarOCrearSpreadsheet() {
  // Buscar spreadsheet existente
  const q = `name='${SPREADSHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
  const r = await apiFetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
  if (r.files && r.files.length > 0) return r.files[0].id;

  // Crear nuevo spreadsheet con todas las hojas
  const sheetNames = Object.values(SHEETS);
  const sheets = sheetNames.map((name, i) => ({
    properties: { title: name, index: i }
  }));

  const resp = await apiFetch(`${SHEETS_API}`, {
    method: 'POST',
    body: JSON.stringify({ properties: { title: SPREADSHEET_NAME }, sheets })
  });

  // Agregar encabezados a cada hoja
  for (const [key, name] of Object.entries(SHEETS)) {
    const headers = SHEET_HEADERS[name];
    if (headers) {
      await apiFetch(`${SHEETS_API}/${resp.spreadsheetId}/values/${name}!A1?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        body: JSON.stringify({ values: [headers] })
      });
    }
  }

  return resp.spreadsheetId;
}

/* ============ READ/WRITE SHEETS ============ */

async function leerSheet(nombreHoja) {
  try {
    const r = await apiFetch(`${SHEETS_API}/${gSpreadsheetId}/values/${nombreHoja}!A:Z`);
    if (!r.values || r.values.length <= 1) return [];
    const headers = r.values[0];
    return r.values.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        let val = row[i] || '';
        // Intentar parsear números y booleanos
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (val !== '' && !isNaN(val) && val !== null) val = Number(val);
        obj[h] = val;
      });
      return obj;
    });
  } catch (e) {
    return [];
  }
}

async function escribirSheet(nombreHoja, data) {
  const headers = SHEET_HEADERS[nombreHoja];
  if (!headers) return;

  const rows = data.map(item =>
    headers.map(h => {
      const v = item[h];
      if (v === undefined || v === null) return '';
      if (typeof v === 'boolean') return v.toString();
      return String(v);
    })
  );

  const maxCol = String.fromCharCode(64 + headers.length);
  const values = [headers, ...rows];

  try {
    await apiFetch(`${SHEETS_API}/${gSpreadsheetId}/values/${nombreHoja}!A1:${maxCol}1000?valueInputOption=USER_ENTERED&insertDataOption=OVERWRITE`, {
      method: 'PUT',
      body: JSON.stringify({ values })
    });
  } catch (e) {
    console.error('Error escribiendo en', nombreHoja, e);
    throw e;
  }
}

/* ============ INIT ============ */

async function inicializarSheets() {
  if (!estaAutenticado()) throw new Error('No autenticado con Google');
  gSpreadsheetId = await buscarOCrearSpreadsheet();

  for (const [store, name] of Object.entries(SHEETS)) {
    gDataCache[store] = await leerSheet(name);
  }
  gReady = true;
}

async function asegurarListo() {
  if (!gReady) await inicializarSheets();
}

async function recargarDatos() {
  if (!estaAutenticado()) throw new Error('No autenticado con Google');
  gReady = false;
  gSpreadsheetId = null;
  gDataCache = {};
  await inicializarSheets();
  return true;
}

/* ============ CRUD GENÉRICO ============ */

async function dbGetAll(storeName) {
  await asegurarListo();
  return [...(gDataCache[storeName] || [])];
}

async function dbGet(storeName, id) {
  await asegurarListo();
  return (gDataCache[storeName] || []).find(item => item.id === id) || null;
}

async function dbPut(storeName, data) {
  await asegurarListo();
  if (!gDataCache[storeName]) gDataCache[storeName] = [];

  const idx = gDataCache[storeName].findIndex(item => item.id === data.id);
  if (idx >= 0) {
    gDataCache[storeName][idx] = data;
  } else {
    gDataCache[storeName].push(data);
  }

  const sheetName = SHEETS[storeName];
  if (sheetName) {
    try {
      await escribirSheet(sheetName, gDataCache[storeName]);
    } catch (e) {
      console.error('Error guardando en Sheets:', storeName, e);
    }
  }
  return data;
}

async function dbDelete(storeName, id) {
  await asegurarListo();
  gDataCache[storeName] = (gDataCache[storeName] || []).filter(item => item.id !== id);

  const sheetName = SHEETS[storeName];
  if (sheetName) {
    try {
      await escribirSheet(sheetName, gDataCache[storeName]);
    } catch (e) {
      console.error('Error eliminando en Sheets:', storeName, e);
    }
  }
}

/* ============ HELPERS ============ */

function generarId() {
  return crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function fechaMasDias(fecha, dias) {
  const d = new Date(fecha + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function formatearFecha(iso) {
  if (!iso) return '';
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

function formatMoney(n) {
  return new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL', minimumFractionDigits: 2 }).format(n || 0);
}

function formatNumber(n) {
  return new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

/* ============ NÚMERO COTIZACIÓN ============ */

async function generarNumeroCotizacion() {
  const cotizaciones = await dbGetAll('cotizaciones');
  const anio = new Date().getFullYear();
  const existentes = cotizaciones
    .filter(c => c.numero && c.numero.startsWith(`COT-${anio}-`))
    .map(c => {
      const num = parseInt(c.numero.split('-')[2], 10);
      return isNaN(num) ? 0 : num;
    });
  const siguiente = existentes.length > 0 ? Math.max(...existentes) + 1 : 1;
  return `COT-${anio}-${String(siguiente).padStart(4, '0')}`;
}

/* ============ CLIENTES ============ */

async function obtenerClientes() { return dbGetAll('clientes'); }

async function guardarCliente(cliente) {
  if (!cliente.id) {
    cliente.id = generarId();
    cliente.fechaRegistro = cliente.fechaRegistro || hoyISO();
  }
  cliente.fechaModificacion = hoyISO();
  return dbPut('clientes', cliente);
}

async function eliminarCliente(id) { return dbDelete('clientes', id); }

async function buscarClientes(termino) {
  const todos = await obtenerClientes();
  const t = normalizar(termino);
  if (!t) return todos;
  return todos.filter(c =>
    normalizar(c.nombre).includes(t) || normalizar(c.rtn).includes(t) ||
    normalizar(c.telefono).includes(t) || normalizar(c.email).includes(t)
  );
}

/* ============ PRODUCTOS ============ */

async function obtenerProductos() { return dbGetAll('productos'); }

async function guardarProducto(producto) {
  if (!producto.id) {
    producto.id = generarId();
    producto.fechaRegistro = producto.fechaRegistro || hoyISO();
  }
  producto.fechaModificacion = hoyISO();
  return dbPut('productos', producto);
}

async function eliminarProducto(id) { return dbDelete('productos', id); }

async function buscarProductos(termino) {
  const todos = await obtenerProductos();
  const t = normalizar(termino);
  if (!t) return todos;
  return todos.filter(p =>
    normalizar(p.codigo).includes(t) || normalizar(p.nombre).includes(t) ||
    normalizar(p.marca).includes(t) || normalizar(p.categoria).includes(t)
  );
}

/* ============ COTIZACIONES ============ */

async function obtenerCotizaciones() { return dbGetAll('cotizaciones'); }

async function guardarCotizacion(cotizacion) {
  if (!cotizacion.id) {
    cotizacion.id = generarId();
    cotizacion.fechaCreacion = cotizacion.fechaCreacion || hoyISO();
    cotizacion.numero = cotizacion.numero || await generarNumeroCotizacion();
  }
  cotizacion.fechaModificacion = hoyISO();
  return dbPut('cotizaciones', cotizacion);
}

async function eliminarCotizacion(id) {
  const detalles = await dbGetAll('detalleCotizacion');
  for (const d of detalles) {
    if (d.cotizacionId === id) await dbDelete('detalleCotizacion', d.id);
  }
  return dbDelete('cotizaciones', id);
}

async function obtenerCotizacionCompleta(id) {
  const cotizacion = await dbGet('cotizaciones', id);
  if (!cotizacion) return null;
  const detalles = await dbGetAll('detalleCotizacion');
  cotizacion.detalles = detalles.filter(d => d.cotizacionId === id);
  return cotizacion;
}

async function guardarDetalleCotizacion(detalle) {
  if (!detalle.id) detalle.id = generarId();
  return dbPut('detalleCotizacion', detalle);
}

async function eliminarDetallesCotizacion(cotizacionId) {
  const detalles = await dbGetAll('detalleCotizacion');
  for (const d of detalles) {
    if (d.cotizacionId === cotizacionId) await dbDelete('detalleCotizacion', d.id);
  }
}

/* ============ CONFIGURACIÓN ============ */

async function obtenerConfiguracion() {
  const configs = await dbGetAll('configuracionEmpresa');
  return configs[0] || {
    id: 'default', nombreEmpresa: 'TELESIS SA DE CV', rtnEmpresa: '08019006039351',
    direccionEmpresa: 'Col. Las Mesetas 18 Ave. 14-15 Calle. Casa #2, Bloque E, San Pedro Sula, Cortes.',
    telefonoEmpresa: '2544-0110', emailEmpresa: '', logoEmpresa: '',
    porcentajeImpuesto: 15, diasVigencia: 30,
    observacionesDefault: '1. Los precios ofertados tienen una validez de 30 días.\n2. Los precios son expresados en Dólares de los Estados Unidos de América.'
  };
}

async function guardarConfiguracion(config) {
  config.id = 'default';
  return dbPut('configuracionEmpresa', config);
}

/* ============ DUPLICAR ============ */

async function duplicarCotizacion(cotizacionId) {
  const original = await obtenerCotizacionCompleta(cotizacionId);
  if (!original) return null;
  const nuevoNumero = await generarNumeroCotizacion();
  const nuevaCotizacion = {
    ...original, id: generarId(), numero: nuevoNumero, fechaCreacion: hoyISO(),
    fechaVencimiento: fechaMasDias(hoyISO(), 30), estado: 'borrador', fechaModificacion: hoyISO()
  };
  delete nuevaCotizacion.detalles;
  await guardarCotizacion(nuevaCotizacion);
  for (const det of (original.detalles || [])) {
    await guardarDetalleCotizacion({ ...det, id: generarId(), cotizacionId: nuevaCotizacion.id });
  }
  return nuevaCotizacion;
}

/* ============ ESTADÍSTICAS ============ */

async function obtenerEstadisticas() {
  const cotizaciones = await obtenerCotizaciones();
  let totalCreadas = cotizaciones.length, pendientes = 0, aprobadas = 0, rechazadas = 0, borradores = 0, vencidas = 0;
  let montoTotalCotizado = 0, montoTotalAprobado = 0;
  for (const c of cotizaciones) {
    const total = Number(c.total) || 0;
    montoTotalCotizado += total;
    switch (c.estado) {
      case 'borrador': borradores++; break;
      case 'enviada': pendientes++; break;
      case 'aprobada': aprobadas++; montoTotalAprobado += total; break;
      case 'rechazada': rechazadas++; break;
      case 'vencida': vencidas++; break;
    }
  }
  return { totalCreadas, pendientes, aprobadas, rechazadas, borradores, vencidas, montoTotalCotizado, montoTotalAprobado };
}

const obtenerCotizacionesModule = obtenerCotizaciones;

/* ============ MIGRACIÓN DE DATOS JSON ============ */

async function migrarDatosJSON(jsonData) {
  await asegurarListo();
  let migrados = { clientes: 0, productos: 0, cotizaciones: 0, detalles: 0, configuracion: 0 };

  // Migrar clientes
  if (jsonData.clientes && Array.isArray(jsonData.clientes)) {
    for (const c of jsonData.clientes) {
      const existente = (gDataCache['clientes'] || []).find(x => x.id === c.id);
      if (!existente) {
        gDataCache['clientes'] = gDataCache['clientes'] || [];
        gDataCache['clientes'].push(c);
        migrados.clientes++;
      }
    }
    if (migrados.clientes > 0) await escribirSheet('Clientes', gDataCache['clientes']);
  }

  // Migrar productos
  if (jsonData.productos && Array.isArray(jsonData.productos)) {
    for (const p of jsonData.productos) {
      const existente = (gDataCache['productos'] || []).find(x => x.id === p.id);
      if (!existente) {
        gDataCache['productos'] = gDataCache['productos'] || [];
        gDataCache['productos'].push(p);
        migrados.productos++;
      }
    }
    if (migrados.productos > 0) await escribirSheet('Productos', gDataCache['productos']);
  }

  // Migrar configuración
  if (jsonData.configuracion && Array.isArray(jsonData.configuracion)) {
    for (const cfg of jsonData.configuracion) {
      const existente = (gDataCache['configuracionEmpresa'] || []).find(x => x.id === cfg.id);
      if (!existente) {
        gDataCache['configuracionEmpresa'] = gDataCache['configuracionEmpresa'] || [];
        gDataCache['configuracionEmpresa'].push(cfg);
        migrados.configuracion++;
      }
    }
    if (migrados.configuracion > 0) await escribirSheet('Configuracion', gDataCache['configuracionEmpresa']);
  }

  // Migrar cotizaciones
  if (jsonData.cotizaciones && Array.isArray(jsonData.cotizaciones)) {
    for (const c of jsonData.cotizaciones) {
      const existente = (gDataCache['cotizaciones'] || []).find(x => x.id === c.id);
      if (!existente) {
        gDataCache['cotizaciones'] = gDataCache['cotizaciones'] || [];
        gDataCache['cotizaciones'].push(c);
        migrados.cotizaciones++;
      }
    }
    if (migrados.cotizaciones > 0) await escribirSheet('Cotizaciones', gDataCache['cotizaciones']);
  }

  // Migrar detalles
  if (jsonData.detalleCotizacion && Array.isArray(jsonData.detalleCotizacion)) {
    for (const d of jsonData.detalleCotizacion) {
      const existente = (gDataCache['detalleCotizacion'] || []).find(x => x.id === d.id);
      if (!existente) {
        gDataCache['detalleCotizacion'] = gDataCache['detalleCotizacion'] || [];
        gDataCache['detalleCotizacion'].push(d);
        migrados.detalles++;
      }
    }
    if (migrados.detalles > 0) await escribirSheet('DetalleCotizacion', gDataCache['detalleCotizacion']);
  }

  return migrados;
}
