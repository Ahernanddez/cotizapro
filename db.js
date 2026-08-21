/* ============================================================
   CotizaPro — Capa de base de datos (Google Drive)
   Almacena todos los datos como archivos JSON en Google Drive.
   ============================================================ */

/* ---- Configuración ---- */
const GOOGLE_CLIENT_ID = '499971275123-ai582md3haki95d9a71qki7iskj1nvab.apps.googleusercontent.com';
const DRIVE_FOLDER_NAME = 'CotizaPro_Data';
const DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.file';

const STORES = {
  clientes: 'clientes',
  productos: 'productos',
  cotizaciones: 'cotizaciones',
  detalleCotizacion: 'detalleCotizacion',
  configuracionEmpresa: 'configuracionEmpresa',
};

const FILE_NAMES = {
  clientes: 'clientes.json',
  productos: 'productos.json',
  cotizaciones: 'cotizaciones.json',
  detalleCotizacion: 'detalleCotizacion.json',
  configuracionEmpresa: 'configuracion.json',
};

/* ---- Estado global ---- */
let gAccessToken = null;
let gFolderId = null;
let gFileIds = {};
let gDataCache = {};
let gAuthenticated = false;
let gReady = false;

const API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

/* ============================================================
   AUTENTICACIÓN CON GOOGLE
   ============================================================ */

function cargarScriptGoogle() {
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
      return reject(new Error('No se pudo cargar Google Identity Services. Verifica tu conexión a internet.'));
    }
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPES,
      callback: (resp) => {
        gAccessToken = resp.access_token;
        gAuthenticated = true;
        resolve(resp);
      },
      error_callback: (err) => reject(err),
    });
    tokenClient.requestAccessToken();
  });
}

function cerrarSesion() {
  if (gAccessToken) {
    try { google.accounts.oauth2.revoke(gAccessToken); } catch (e) {}
    gAccessToken = null;
    gAuthenticated = false;
    gReady = false;
    gFolderId = null;
    gFileIds = {};
    gDataCache = {};
  }
}

function estaAutenticado() {
  return gAuthenticated && !!gAccessToken;
}

/* ============================================================
   OPERACIONES CON GOOGLE DRIVE API
   ============================================================ */

async function driveFetch(url, options = {}) {
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Authorization': 'Bearer ' + gAccessToken,
      ...(options.headers || {}),
    },
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Error Drive API ${resp.status}: ${txt}`);
  }
  return resp.json();
}

async function buscarOCrearCarpeta(nombre) {
  const q = `name='${nombre}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const r = await driveFetch(`${API_BASE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
  if (r.files && r.files.length > 0) return r.files[0].id;

  const f = await driveFetch(`${API_BASE}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nombre, mimeType: 'application/vnd.google-apps.folder' }),
  });
  return f.id;
}

async function buscarArchivo(nombre, parentId) {
  const q = `name='${nombre}' and '${parentId}' in parents and trashed=false`;
  const r = await driveFetch(`${API_BASE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
  return r.files && r.files[0] ? r.files[0].id : null;
}

async function leerArchivoContenido(fileId) {
  const resp = await fetch(`${API_BASE}/files/${fileId}?alt=media`, {
    headers: { 'Authorization': 'Bearer ' + gAccessToken },
  });
  const txt = await resp.text();
  if (!txt || txt.trim() === '') return [];
  try { return JSON.parse(txt); } catch { return []; }
}

async function escribirArchivoContenido(fileId, data) {
  await fetch(`${UPLOAD_BASE}/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      'Authorization': 'Bearer ' + gAccessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
}

async function crearArchivo(nombre, parentId, data) {
  const metadata = { name: nombre, parents: [parentId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const resp = await fetch(`${UPLOAD_BASE}/files?uploadType=multipart`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + gAccessToken },
    body: form,
  });
  return resp.json();
}

/* ============================================================
   INICIALIZACIÓN DEL DRIVE
   ============================================================ */

async function inicializarDrive() {
  if (!estaAutenticado()) throw new Error('No autenticado con Google');

  gFolderId = await buscarOCrearCarpeta(DRIVE_FOLDER_NAME);

  for (const [store, filename] of Object.entries(FILE_NAMES)) {
    let fileId = await buscarArchivo(filename, gFolderId);
    if (!fileId) {
      const file = await crearArchivo(filename, gFolderId, []);
      fileId = file.id;
    }
    gFileIds[store] = fileId;
    gDataCache[store] = await leerArchivoContenido(fileId);
  }

  gReady = true;
}

async function asegurarListo() {
  if (!gReady) await inicializarDrive();
}

/* ============================================================
   OPERACIONES CRUD GENÉRICAS
   ============================================================ */

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

  await escribirArchivoContenido(gFileIds[storeName], gDataCache[storeName]);
  return data;
}

async function dbDelete(storeName, id) {
  await asegurarListo();
  gDataCache[storeName] = (gDataCache[storeName] || []).filter(item => item.id !== id);
  await escribirArchivoContenido(gFileIds[storeName], gDataCache[storeName]);
}

async function dbClear(storeName) {
  await asegurarListo();
  gDataCache[storeName] = [];
  await escribirArchivoContenido(gFileIds[storeName], []);
}

/* ============================================================
   FUNCIONES AUXILIARES
   ============================================================ */

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

/* ============================================================
   GENERACIÓN DE NÚMERO DE COTIZACIÓN
   ============================================================ */

async function generarNumeroCotizacion() {
  const cotizaciones = await dbGetAll(STORES.cotizaciones);
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

/* ============================================================
   CLIENTES
   ============================================================ */

async function obtenerClientes() {
  return dbGetAll(STORES.clientes);
}

async function guardarCliente(cliente) {
  if (!cliente.id) {
    cliente.id = generarId();
    cliente.fechaRegistro = cliente.fechaRegistro || hoyISO();
  }
  cliente.fechaModificacion = hoyISO();
  return dbPut(STORES.clientes, cliente);
}

async function eliminarCliente(id) {
  return dbDelete(STORES.clientes, id);
}

async function buscarClientes(termino) {
  const todos = await obtenerClientes();
  const t = normalizar(termino);
  if (!t) return todos;
  return todos.filter(c =>
    normalizar(c.nombre).includes(t) ||
    normalizar(c.rtn).includes(t) ||
    normalizar(c.telefono).includes(t) ||
    normalizar(c.email).includes(t)
  );
}

/* ============================================================
   PRODUCTOS
   ============================================================ */

async function obtenerProductos() {
  return dbGetAll(STORES.productos);
}

async function guardarProducto(producto) {
  if (!producto.id) {
    producto.id = generarId();
    producto.fechaRegistro = producto.fechaRegistro || hoyISO();
  }
  producto.fechaModificacion = hoyISO();
  return dbPut(STORES.productos, producto);
}

async function eliminarProducto(id) {
  return dbDelete(STORES.productos, id);
}

async function buscarProductos(termino) {
  const todos = await obtenerProductos();
  const t = normalizar(termino);
  if (!t) return todos;
  return todos.filter(p =>
    normalizar(p.codigo).includes(t) ||
    normalizar(p.nombre).includes(t) ||
    normalizar(p.marca).includes(t) ||
    normalizar(p.categoria).includes(t) ||
    normalizar(p.modelo).includes(t)
  );
}

/* ============================================================
   COTIZACIONES
   ============================================================ */

async function obtenerCotizaciones() {
  return dbGetAll(STORES.cotizaciones);
}

async function guardarCotizacion(cotizacion) {
  if (!cotizacion.id) {
    cotizacion.id = generarId();
    cotizacion.fechaCreacion = cotizacion.fechaCreacion || hoyISO();
    cotizacion.numero = cotizacion.numero || await generarNumeroCotizacion();
  }
  cotizacion.fechaModificacion = hoyISO();
  return dbPut(STORES.cotizaciones, cotizacion);
}

async function eliminarCotizacion(id) {
  const detalles = await dbGetAll(STORES.detalleCotizacion);
  for (const d of detalles) {
    if (d.cotizacionId === id) {
      await dbDelete(STORES.detalleCotizacion, d.id);
    }
  }
  return dbDelete(STORES.cotizaciones, id);
}

async function obtenerCotizacionCompleta(id) {
  const cotizacion = await dbGet(STORES.cotizaciones, id);
  if (!cotizacion) return null;
  const detalles = await dbGetAll(STORES.detalleCotizacion);
  cotizacion.detalles = detalles.filter(d => d.cotizacionId === id);
  return cotizacion;
}

async function guardarDetalleCotizacion(detalle) {
  if (!detalle.id) {
    detalle.id = generarId();
  }
  return dbPut(STORES.detalleCotizacion, detalle);
}

async function eliminarDetallesCotizacion(cotizacionId) {
  const detalles = await dbGetAll(STORES.detalleCotizacion);
  for (const d of detalles) {
    if (d.cotizacionId === cotizacionId) {
      await dbDelete(STORES.detalleCotizacion, d.id);
    }
  }
}

/* ============================================================
   CONFIGURACIÓN DE EMPRESA
   ============================================================ */

async function obtenerConfiguracion() {
  const configs = await dbGetAll(STORES.configuracionEmpresa);
  return configs[0] || {
    id: 'default',
    nombreEmpresa: 'TELESIS SA DE CV',
    rtnEmpresa: '08019006039351',
    direccionEmpresa: 'Col. Las Mesetas 18 Ave. 14-15 Calle. Casa #2, Bloque E, San Pedro Sula, Cortes.',
    telefonoEmpresa: '2544-0110',
    emailEmpresa: '',
    logoEmpresa: '',
    porcentajeImpuesto: 15,
    diasVigencia: 30,
    observacionesDefault: '1. Los precios ofertados tienen una validez de 30 días.\n2. Los precios son expresados en Dólares de los Estados Unidos de América.',
  };
}

async function guardarConfiguracion(config) {
  config.id = 'default';
  return dbPut(STORES.configuracionEmpresa, config);
}

/* ============================================================
   DUPLICAR COTIZACIÓN
   ============================================================ */

async function duplicarCotizacion(cotizacionId) {
  const original = await obtenerCotizacionCompleta(cotizacionId);
  if (!original) return null;

  const nuevoNumero = await generarNumeroCotizacion();
  const nuevaCotizacion = {
    ...original,
    id: generarId(),
    numero: nuevoNumero,
    fechaCreacion: hoyISO(),
    fechaVencimiento: fechaMasDias(hoyISO(), 30),
    estado: 'borrador',
    fechaModificacion: hoyISO(),
  };
  delete nuevaCotizacion.detalles;
  await guardarCotizacion(nuevaCotizacion);

  for (const det of (original.detalles || [])) {
    const nuevoDet = { ...det, id: generarId(), cotizacionId: nuevaCotizacion.id };
    await guardarDetalleCotizacion(nuevoDet);
  }

  return nuevaCotizacion;
}

/* ============================================================
   ESTADÍSTICAS DEL DASHBOARD
   ============================================================ */

async function obtenerEstadisticas() {
  const cotizaciones = await obtenerCotizacionesModule();
  let totalCreadas = cotizaciones.length;
  let pendientes = 0, aprobadas = 0, rechazadas = 0, borradores = 0, vencidas = 0;
  let montoTotalCotizado = 0, montoTotalAprobado = 0;

  for (const c of cotizaciones) {
    const total = c.total || 0;
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
