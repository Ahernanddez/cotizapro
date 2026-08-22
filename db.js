/* ============================================================
   CotizaPro — Base de datos con Google Sheets
   Todos los datos se guardan en una hoja de cálculo compartida.
   ============================================================ */

const GOOGLE_CLIENT_ID = '499971275123-ai582md3haki95d9a71qki7iskj1nvab.apps.googleusercontent.com';
const SHEETS_SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive';
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
let gSpreadsheetId = localStorage.getItem('cotizapro_sheet_id') || null;
let gDataCache = {};
let gReady = false;

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

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
      scope: SHEETS_SCOPES,
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
    gDataCache = {};
    sessionStorage.removeItem('cotizapro_token');
    // NO borrar cotizapro_sheet_id — se mantiene para reusar el mismo spreadsheet
  }
}

function estaAutenticado() { return gAuthenticated && !!gAccessToken; }

async function obtenerEmailGoogle() {
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { 'Authorization': 'Bearer ' + gAccessToken }
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.email || null;
  } catch (e) {
    return null;
  }
}

async function compartirSpreadsheet(email) {
  if (!gSpreadsheetId || !email) return false;
  try {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${gSpreadsheetId}/permissions?sendNotificationEmail=false`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + gAccessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'writer', type: 'user', emailAddress: email })
    });
    if (!r.ok) { console.error('Error compartiendo:', r.status); return false; }
    console.log('Spreadsheet compartido con:', email);
    return true;
  } catch (e) {
    console.error('Error compartiendo:', e);
    return false;
  }
}

/* ============ GOOGLE SHEETS API HELPERS ============ */

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
  // 1. Si ya tenemos un ID guardado, intentar usarlo
  if (gSpreadsheetId) {
    try {
      await apiFetch(`${SHEETS_API}/${gSpreadsheetId}`);
      return gSpreadsheetId;
    } catch (e) {
      console.warn('Sheet ID guardado no válido, buscando por nombre...');
      gSpreadsheetId = null;
    }
  }

  // 2. Buscar spreadsheet existente por nombre usando Drive API (solo lectura)
  try {
    const searchUrl = 'https://www.googleapis.com/drive/v3/files?q=' +
      encodeURIComponent(`mimeType='application/vnd.google-apps.spreadsheet' and name='${SPREADSHEET_NAME}' and trashed=false`) +
      '&fields=files(id,name)';
    const r = await fetch(searchUrl, {
      headers: { 'Authorization': 'Bearer ' + gAccessToken }
    });
    if (r.ok) {
      const d = await r.json();
      if (d.files && d.files.length > 0) {
        gSpreadsheetId = d.files[0].id;
        localStorage.setItem('cotizapro_sheet_id', gSpreadsheetId);
        // Verificar que tenga todas las hojas necesarias
        const existingSheets = await apiFetch(`${SHEETS_API}/${gSpreadsheetId}`);
        const existNames = (existingSheets.sheets || []).map(s => s.properties.title);
        for (const [key, name] of Object.entries(SHEETS)) {
          if (!existNames.includes(name)) {
            await apiFetch(`${SHEETS_API}/${gSpreadsheetId}:batchUpdate`, {
              method: 'POST',
              body: JSON.stringify({ requests: [{ addSheet: { properties: { title: name } } }] })
            });
            const headers = SHEET_HEADERS[name];
            if (headers) {
              await apiFetch(`${SHEETS_API}/${gSpreadsheetId}/values/${name}!A1?valueInputOption=USER_ENTERED`, {
                method: 'PUT',
                body: JSON.stringify({ values: [headers] })
              });
            }
          }
        }
        console.log('Spreadsheet encontrado por nombre:', gSpreadsheetId);
        return gSpreadsheetId;
      }
    }
  } catch (e) {
    console.warn('Error buscando por nombre:', e);
  }

  // 3. No existe — crear nuevo spreadsheet con todas las hojas
  console.log('Creando nuevo spreadsheet...');
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

  gSpreadsheetId = resp.spreadsheetId;
  localStorage.setItem('cotizapro_sheet_id', gSpreadsheetId);
  return gSpreadsheetId;
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

  const numCols = headers.length;
  const numRows = rows.length + 1;
  const maxCol = String.fromCharCode(64 + numCols);
  const range = `${nombreHoja}!A1:${maxCol}${numRows}`;
  const values = [headers, ...rows];

  console.log('Escribiendo en', nombreHoja, ':', rows.length, 'filas,', range);

  try {
    await apiFetch(`${SHEETS_API}/${gSpreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
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

async function recargarDatos() {
  if (!estaAutenticado()) throw new Error('No autenticado con Google');
  gReady = false;
  gDataCache = {};
  await inicializarSheets();
  return true;
}

async function asegurarListo() {
  if (!gReady) await inicializarSheets();
}

/* ============ CRUD ============ */

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
      console.log('Guardado OK en', sheetName, '—', gDataCache[storeName].length, 'registros');
    } catch (e) {
      console.error('Error guardando en Sheets:', storeName, e);
      if (typeof toast === 'function') toast('Error al guardar: ' + e.message, 'error');
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

/* ============ UTILS ============ */

function generarId() {
  return crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function fechaMasDias(f, d) {
  const dt = new Date(f + 'T12:00:00');
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0, 10);
}

function formatearFecha(i) {
  if (!i) return '';
  try {
    return new Date(i + 'T12:00:00').toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return i; }
}

function formatMoney(n) {
  return new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL', minimumFractionDigits: 2 }).format(n || 0);
}

function formatNumber(n) {
  return new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

async function generarNumeroCotizacion() {
  const cs = await dbGetAll('cotizaciones');
  const anio = new Date().getFullYear();
  const existentes = cs.filter(c => c.numero && c.numero.startsWith('COT-' + anio + '-'))
    .map(c => { const n = parseInt(c.numero.split('-')[2], 10); return isNaN(n) ? 0 : n; });
  const siguiente = existentes.length > 0 ? Math.max(...existentes) + 1 : 1;
  return 'COT-' + anio + '-' + String(siguiente).padStart(4, '0');
}

async function obtenerClientes() { return dbGetAll('clientes'); }
async function guardarCliente(c) {
  if (!c.id) { c.id = generarId(); c.fechaRegistro = c.fechaRegistro || hoyISO(); }
  c.fechaModificacion = hoyISO();
  return dbPut('clientes', c);
}
async function eliminarCliente(id) { return dbDelete('clientes', id); }

async function obtenerProductos() { return dbGetAll('productos'); }
async function guardarProducto(p) {
  if (!p.id) { p.id = generarId(); p.fechaRegistro = p.fechaRegistro || hoyISO(); }
  p.fechaModificacion = hoyISO();
  return dbPut('productos', p);
}
async function eliminarProducto(id) { return dbDelete('productos', id); }

async function obtenerCotizaciones() { return dbGetAll('cotizaciones'); }
async function guardarCotizacion(c) {
  if (!c.id) { c.id = generarId(); c.fechaCreacion = c.fechaCreacion || hoyISO(); }
  c.fechaModificacion = hoyISO();
  return dbPut('cotizaciones', c);
}
async function eliminarCotizacion(id) { return dbDelete('cotizaciones', id); }
async function obtenerCotizacionCompleta(id) {
  const c = await dbGet('cotizaciones', id);
  if (!c) return null;
  const detalles = (await dbGetAll('detalleCotizacion')).filter(d => d.cotizacionId === id);
  return { ...c, detalles };
}

async function obtenerDetallesCotizacion(cotizacionId) {
  const all = await dbGetAll('detalleCotizacion');
  return all.filter(d => d.cotizacionId === cotizacionId);
}

async function guardarDetalleCotizacion(d) {
  if (!d.id) d.id = generarId();
  return dbPut('detalleCotizacion', d);
}

async function eliminarDetallesCotizacion(cotizacionId) {
  const all = await dbGetAll('detalleCotizacion');
  const ids = all.filter(d => d.cotizacionId === cotizacionId).map(d => d.id);
  for (const id of ids) { await dbDelete('detalleCotizacion', id); }
}

async function obtenerConfiguracion() {
  const cfg = await dbGetAll('configuracionEmpresa');
  return cfg.length > 0 ? cfg[0] : { id: 'default', nombreEmpresa: '', rtnEmpresa: '', direccionEmpresa: '', telefonoEmpresa: '', emailEmpresa: '', logoEmpresa: '', porcentajeImpuesto: 15, diasVigencia: 30, observacionesDefault: '' };
}

async function guardarConfiguracion(cfg) {
  cfg.id = 'default';
  return dbPut('configuracionEmpresa', cfg);
}

async function obtenerUsuarios() { return dbGetAll('usuarios'); }
async function guardarUsuario(u) {
  if (!u.id) u.id = generarId();
  return dbPut('usuarios', u);
}
async function eliminarUsuario(id) { return dbDelete('usuarios', id); }
