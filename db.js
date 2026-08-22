/* ============================================================
   CotizaPro — Base de datos con Google Sheets
   Todos los datos se guardan en una hoja de cálculo compartida.
   Solo usa Google Sheets API (sin Google Drive API).
   ============================================================ */

const GOOGLE_CLIENT_ID = '499971275123-ai582md3haki95d9a71qki7iskj1nvab.apps.googleusercontent.com';
const SHEETS_SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
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
    gSpreadsheetId = null;
    gDataCache = {};
    sessionStorage.removeItem('cotizapro_token');
    localStorage.removeItem('cotizapro_sheet_id');
  }
}

function estaAutenticado() { return gAuthenticated && !!gAccessToken; }

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
  // Si ya tenemos un ID guardado, intentar usarlo
  if (gSpreadsheetId) {
    try {
      await apiFetch(`${SHEETS_API}/${gSpreadsheetId}`);
      return gSpreadsheetId;
    } catch (e) {
      // El spreadsheet ya no existe, crear uno nuevo
      gSpreadsheetId = null;
      localStorage.removeItem('cotizapro_sheet_id');
    }
  }

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

  const maxCol = String.fromCharCode(64 + headers.length);
  const values = [headers, ...rows];

  try {
    await apiFetch(`${SHEETS_API}/${gSpreadsheetId}/values/${nombreHoja}!A1:${maxCol}1000?valueInputOption=USER_ENTERED`, {
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
