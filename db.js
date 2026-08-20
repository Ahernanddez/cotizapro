/* ============================================================
   CotizaPro — Capa de base de datos (IndexedDB)
   ============================================================ */

const DB_NAME = 'cotizapro-db';
const DB_VERSION = 1;

const STORES = {
  clientes: 'clientes',
  productos: 'productos',
  cotizaciones: 'cotizaciones',
  detalleCotizacion: 'detalleCotizacion',
  configuracionEmpresa: 'configuracionEmpresa',
};

function abrirBD() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      // Clientes
      if (!db.objectStoreNames.contains(STORES.clientes)) {
        const cs = db.createObjectStore(STORES.clientes, { keyPath: 'id' });
        cs.createIndex('nombre', 'nombre', { unique: false });
        cs.createIndex('rtn', 'rtn', { unique: false });
      }
      // Productos
      if (!db.objectStoreNames.contains(STORES.productos)) {
        const ps = db.createObjectStore(STORES.productos, { keyPath: 'id' });
        ps.createIndex('codigo', 'codigo', { unique: true });
        ps.createIndex('categoria', 'categoria', { unique: false });
        ps.createIndex('nombre', 'nombre', { unique: false });
      }
      // Cotizaciones
      if (!db.objectStoreNames.contains(STORES.cotizaciones)) {
        const ct = db.createObjectStore(STORES.cotizaciones, { keyPath: 'id' });
        ct.createIndex('numero', 'numero', { unique: true });
        ct.createIndex('clienteId', 'clienteId', { unique: false });
        ct.createIndex('estado', 'estado', { unique: false });
        ct.createIndex('fechaCreacion', 'fechaCreacion', { unique: false });
      }
      // Detalle cotización
      if (!db.objectStoreNames.contains(STORES.detalleCotizacion)) {
        const dc = db.createObjectStore(STORES.detalleCotizacion, { keyPath: 'id' });
        dc.createIndex('cotizacionId', 'cotizacionId', { unique: false });
      }
      // Configuración empresa
      if (!db.objectStoreNames.contains(STORES.configuracionEmpresa)) {
        db.createObjectStore(STORES.configuracionEmpresa, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ---- Operaciones CRUD genéricas ---- */

async function dbGetAll(storeName) {
  const db = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(storeName, id) {
  const db = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(storeName, data) {
  const db = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(data);
    tx.oncomplete = () => resolve(data);
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDelete(storeName, id) {
  const db = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbClear(storeName) {
  const db = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---- Funciones específicas ---- */

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

/* ---- Generación de número de cotización ---- */

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

/* ---- Clientes ---- */

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

/* ---- Productos ---- */

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

/* ---- Cotizaciones ---- */

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
  // Eliminar también el detalle
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

/* ---- Configuración de empresa ---- */

async function obtenerConfiguracion() {
  const configs = await dbGetAll(STORES.configuracionEmpresa);
  return configs[0] || {
    id: 'default',
    nombreEmpresa: '',
    rtnEmpresa: '',
    direccionEmpresa: '',
    telefonoEmpresa: '',
    emailEmpresa: '',
    logoEmpresa: '',
    porcentajeImpuesto: 15,
    diasVigencia: 30,
    observacionesDefault: 'Esta cotización tiene una vigencia de 30 días a partir de su fecha de emisión.\nLos precios están sujetos a cambios sin previo aviso.\nSe requiere un anticipo del 50% para proceder con el trabajo.',
  };
}

async function guardarConfiguracion(config) {
  config.id = 'default';
  return dbPut(STORES.configuracionEmpresa, config);
}

/* ---- Duplicar cotización ---- */

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

/* ---- Estadísticas del dashboard ---- */

async function obtenerEstadisticas() {
  const cotizaciones = await obtenerCotizacionesModule();
  let totalCreadas = cotizaciones.length;
  let pendientes = 0, aprobadas = 0, rechazadas = 0, borradores = 0, vencidas = 0;
  let montoTotalCotizado = 0, montoTotalAprobado = 0;

  for (const c of cotizaciones) {
    const subtotal = c.subtotal || 0;
    const descuento = c.descuento || 0;
    const impuesto = c.impuesto || 0;
    const manoObra = c.manoObra || 0;
    const transporte = c.transporte || 0;
    const materiales = c.materialesAdicionales || 0;
    const otros = c.otrosCostos || 0;
    const total = subtotal - descuento + impuesto + manoObra + transporte + materiales + otros;

    montoTotalCotizado += total;

    switch (c.estado) {
      case 'borrador': borradores++; break;
      case 'enviada': pendientes++; break;
      case 'aprobada': aprobadas++; montoTotalAprobado += total; break;
      case 'rechazada': rechazadas++; break;
      case 'vencida': vencidas++; break;
    }
  }

  return {
    totalCreadas,
    pendientes,
    aprobadas,
    rechazadas,
    borradores,
    vencidas,
    montoTotalCotizado,
    montoTotalAprobado,
  };
}

// Alias para evitar conflicto de nombres
const obtenerCotizacionesModule = obtenerCotizaciones;
