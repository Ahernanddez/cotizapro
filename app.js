/* ============================================================
   CotizaPro — Lógica principal de la aplicación
   ============================================================ */

'use strict';

/* ---- Utilidades ---- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, type = 'info') {
  const div = document.createElement('div');
  div.className = 'toast ' + type;
  div.textContent = msg;
  $('#toastContainer').appendChild(div);
  setTimeout(() => {
    div.style.transition = 'opacity .3s, transform .3s';
    div.style.opacity = '0';
    div.style.transform = 'translateY(6px)';
    setTimeout(() => div.remove(), 300);
  }, 3000);
}

/* ---- Sidebar ---- */
function toggleSidebar() {
  $('#sidebar').classList.toggle('open');
  $('#sidebarOverlay').classList.toggle('open');
}

let currentView = 'dashboard';

function navegar(view) {
  currentView = view;
  $$('.view').forEach(v => v.hidden = true);
  const el = $(`#view-${view}`);
  if (el) el.hidden = false;

  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));

  const titles = {
    dashboard: 'Dashboard',
    clientes: 'Clientes',
    productos: 'Productos y Servicios',
    cotizaciones: 'Cotizaciones',
    'form-cotizacion': 'Cotización',
    configuracion: 'Configuración',
  };
  $('#topbarTitle').textContent = titles[view] || 'CotizaPro';

  // Cerrar sidebar en móvil
  $('#sidebar').classList.remove('open');
  $('#sidebarOverlay').classList.remove('open');

  // Renderizar vista
  switch (view) {
    case 'dashboard': renderDashboard(); break;
    case 'clientes': renderClientes(); break;
    case 'productos': renderProductos(); break;
    case 'cotizaciones': renderCotizaciones(); break;
    case 'configuracion': renderConfiguracion(); break;
  }
}

/* ============ DASHBOARD ============ */
async function renderDashboard() {
  const stats = await obtenerEstadisticas();
  const cotizaciones = await obtenerCotizaciones();

  $('#dashboardStats').innerHTML = `
    <div class="stat-card" onclick="navegar('cotizaciones')">
      <div class="stat-icon blue">📄</div>
      <div class="stat-info">
        <h3>${stats.totalCreadas}</h3>
        <p>Total Cotizaciones</p>
      </div>
    </div>
    <div class="stat-card" onclick="filtrarYnavegar('borrador')">
      <div class="stat-icon yellow">📝</div>
      <div class="stat-info">
        <h3>${stats.borradores}</h3>
        <p>Borradores</p>
      </div>
    </div>
    <div class="stat-card" onclick="filtrarYnavegar('enviada')">
      <div class="stat-icon blue">📤</div>
      <div class="stat-info">
        <h3>${stats.pendientes}</h3>
        <p>Enviadas</p>
      </div>
    </div>
    <div class="stat-card" onclick="filtrarYnavegar('aprobada')">
      <div class="stat-icon green">✅</div>
      <div class="stat-info">
        <h3>${stats.aprobadas}</h3>
        <p>Aprobadas</p>
      </div>
    </div>
    <div class="stat-card" onclick="filtrarYnavegar('rechazada')">
      <div class="stat-icon red">❌</div>
      <div class="stat-info">
        <h3>${stats.rechazadas}</h3>
        <p>Rechazadas</p>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon green">💰</div>
      <div class="stat-info">
        <h3 style="font-size:20px">${formatMoney(stats.montoTotalAprobado)}</h3>
        <p>Monto Aprobado</p>
      </div>
    </div>
  `;

  // Cotizaciones recientes
  const recientes = [...cotizaciones].sort((a, b) => (b.fechaCreacion || '').localeCompare(a.fechaCreacion || '')).slice(0, 5);
  if (recientes.length === 0) {
    $('#recentQuotes').innerHTML = `
      <div class="empty-state" style="padding:30px">
        <span class="empty-icon">📄</span>
        <h3>No hay cotizaciones aún</h3>
        <p>Crea tu primera cotización para comenzar</p>
        <button class="btn btn-primary" onclick="nuevaCotizacion()">➕ Crear Cotización</button>
      </div>`;
  } else {
    const clientes = await obtenerClientes();
    const clienteMap = {};
    clientes.forEach(c => clienteMap[c.id] = c);

    let html = '<table style="width:100%;border-collapse:collapse">';
    html += '<thead><tr><th style="text-align:left;padding:8px 12px;font-size:12px;color:var(--text-secondary);border-bottom:1px solid var(--border)">Número</th><th style="text-align:left;padding:8px 12px;font-size:12px;color:var(--text-secondary);border-bottom:1px solid var(--border)">Cliente</th><th style="text-align:left;padding:8px 12px;font-size:12px;color:var(--text-secondary);border-bottom:1px solid var(--border)">Fecha</th><th style="text-align:left;padding:8px 12px;font-size:12px;color:var(--text-secondary);border-bottom:1px solid var(--border)">Estado</th><th style="text-align:right;padding:8px 12px;font-size:12px;color:var(--text-secondary);border-bottom:1px solid var(--border)">Total</th></tr></thead><tbody>';

    for (const c of recientes) {
      const cli = clienteMap[c.clienteId];
      const badge = getBadgeClass(c.estado);
      html += `<tr style="cursor:pointer" onclick="editarCotizacion('${c.id}')">
        <td style="padding:10px 12px;border-bottom:1px solid var(--border-light);font-weight:600;font-size:13px">${esc(c.numero)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border-light);font-size:13px">${esc(cli ? cli.nombre : 'Sin cliente')}</td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border-light);font-size:13px;color:var(--text-secondary)">${formatearFecha(c.fechaCreacion)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border-light)"><span class="badge ${badge}">${c.estado}</span></td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border-light);text-align:right;font-weight:600;font-size:13px">${formatMoney(c.total)}</td>
      </tr>`;
    }
    html += '</tbody></table>';
    $('#recentQuotes').innerHTML = html;
  }

  // Badge del nav
  const pendientes = stats.pendientes + stats.borradores;
  const badge = $('#navBadgeCotizaciones');
  if (pendientes > 0) {
    badge.textContent = pendientes;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

function filtrarYnavegar(estado) {
  navegar('cotizaciones');
  $('#filtroEstadoCotizacion').value = estado;
  renderCotizaciones();
}

function getBadgeClass(estado) {
  switch (estado) {
    case 'borrador': return 'badge-draft';
    case 'enviada': return 'badge-sent';
    case 'aprobada': return 'badge-approved';
    case 'rechazada': return 'badge-rejected';
    case 'vencida': return 'badge-expired';
    default: return 'badge-draft';
  }
}

/* ============ CLIENTES ============ */
let clienteEditandoId = null;

async function renderClientes() {
  const termino = $('#busquedaClientes').value;
  let clientes = await buscarClientes(termino);
  clientes.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

  if (clientes.length === 0) {
    $('#tablaClientes').innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">👥</span>
        <h3>No hay clientes registrados</h3>
        <p>Agrega tu primer cliente para empezar a crear cotizaciones</p>
        <button class="btn btn-primary" onclick="abrirModalCliente()">➕ Nuevo Cliente</button>
      </div>`;
    return;
  }

  let html = '<table style="width:100%;border-collapse:collapse">';
  html += '<thead><tr>';
  html += '<th style="text-align:left;padding:10px 12px;font-size:12px;color:var(--text-secondary);border-bottom:1px solid var(--border);background:var(--surface-alt)">Nombre</th>';
  html += '<th style="text-align:left;padding:10px 12px;font-size:12px;color:var(--text-secondary);border-bottom:1px solid var(--border);background:var(--surface-alt)">RTN</th>';
  html += '<th style="text-align:left;padding:10px 12px;font-size:12px;color:var(--text-secondary);border-bottom:1px solid var(--border);background:var(--surface-alt)">Teléfono</th>';
  html += '<th style="text-align:left;padding:10px 12px;font-size:12px;color:var(--text-secondary);border-bottom:1px solid var(--border);background:var(--surface-alt)">Email</th>';
  html += '<th style="text-align:left;padding:10px 12px;font-size:12px;color:var(--text-secondary);border-bottom:1px solid var(--border);background:var(--surface-alt)">Contacto</th>';
  html += '<th style="text-align:right;padding:10px 12px;font-size:12px;color:var(--text-secondary);border-bottom:1px solid var(--border);background:var(--surface-alt)">Acciones</th>';
  html += '</tr></thead><tbody>';

  for (const c of clientes) {
    html += `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border-light);font-weight:600">${esc(c.nombre)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border-light);font-size:13px;font-family:monospace">${esc(c.rtn || '-')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border-light);font-size:13px">${esc(c.telefono || '-')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border-light);font-size:13px">${esc(c.email || '-')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border-light);font-size:13px">${esc(c.contacto || '-')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border-light);text-align:right">
        <div style="display:flex;gap:4px;justify-content:flex-end">
          <button class="btn btn-sm" onclick="editarCliente('${c.id}')" title="Editar">✏️</button>
          <button class="btn btn-sm btn-danger" onclick="confirmarEliminarCliente('${c.id}', '${esc(c.nombre)}')" title="Eliminar">🗑</button>
        </div>
      </td>
    </tr>`;
  }
  html += '</tbody></table>';
  $('#tablaClientes').innerHTML = html;
}

function abrirModalCliente(desdeCotizacion = false) {
  clienteEditandoId = null;
  $('#modalClienteTitle').textContent = '👤 Nuevo Cliente';
  $('#cliNombre').value = '';
  $('#cliRtn').value = '';
  $('#cliTelefono').value = '';
  $('#cliEmail').value = '';
  $('#cliDireccion').value = '';
  $('#cliContacto').value = '';
  $('#modalCliente').hidden = false;
  setTimeout(() => $('#cliNombre').focus(), 100);
  $('#modalCliente').dataset.desdeCotizacion = desdeCotizacion ? 'true' : 'false';
}

function cerrarModalCliente() {
  $('#modalCliente').hidden = true;
}

async function editarCliente(id) {
  const cliente = await dbGet(STORES.clientes, id);
  if (!cliente) return;
  clienteEditandoId = id;
  $('#modalClienteTitle').textContent = '👤 Editar Cliente';
  $('#cliNombre').value = cliente.nombre || '';
  $('#cliRtn').value = cliente.rtn || '';
  $('#cliTelefono').value = cliente.telefono || '';
  $('#cliEmail').value = cliente.email || '';
  $('#cliDireccion').value = cliente.direccion || '';
  $('#cliContacto').value = cliente.contacto || '';
  $('#modalCliente').hidden = false;
}

async function guardarClienteForm() {
  const nombre = $('#cliNombre').value.trim();
  if (!nombre) {
    toast('El nombre es obligatorio', 'error');
    return;
  }

  const cliente = {
    id: clienteEditandoId || undefined,
    nombre,
    rtn: $('#cliRtn').value.trim(),
    telefono: $('#cliTelefono').value.trim(),
    email: $('#cliEmail').value.trim(),
    direccion: $('#cliDireccion').value.trim(),
    contacto: $('#cliContacto').value.trim(),
  };

  await guardarCliente(cliente);
  toast('Cliente guardado correctamente', 'success');
  cerrarModalCliente();

  // Si venía desde la cotización, actualizar el select
  if ($('#modalCliente').dataset.desdeCotizacion === 'true') {
    await cargarSelectClientes(cliente.id);
  } else {
    renderClientes();
  }
}

function confirmarEliminarCliente(id, nombre) {
  $('#confirmTitle').textContent = '🗑 Eliminar Cliente';
  $('#confirmMsg').textContent = `¿Eliminar al cliente "${nombre}"? Esta acción no se puede deshacer.`;
  $('#confirmBtn').onclick = async () => {
    await eliminarCliente(id);
    toast('Cliente eliminado', 'success');
    cerrarConfirm();
    renderClientes();
  };
  $('#modalConfirm').hidden = false;
}

/* ============ PRODUCTOS ============ */
let productoEditandoId = null;

async function renderProductos() {
  const termino = $('#busquedaProductos').value;
  let productos = await buscarProductos(termino);

  // Filtro de categoría
  const cat = $('#filtroCategoria').value;
  if (cat && cat !== 'todas') {
    productos = productos.filter(p => p.categoria === cat);
  }

  productos.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

  // Actualizar filtro de categorías
  const todos = await obtenerProductos();
  const categorias = [...new Set(todos.map(p => p.categoria).filter(Boolean))].sort();
  const select = $('#filtroCategoria');
  const actual = select.value;
  select.innerHTML = '<option value="todas">Todas las categorías</option>' +
    categorias.map(c => `<option value="${esc(c)}" ${c === actual ? 'selected' : ''}>${esc(c)}</option>`).join('');

  if (productos.length === 0) {
    $('#tablaProductos').innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📦</span>
        <h3>No hay productos registrados</h3>
        <p>Agrega productos y servicios a tu catálogo</p>
        <button class="btn btn-primary" onclick="abrirModalProducto()">➕ Nuevo Producto</button>
      </div>`;
    return;
  }

  let html = '<table style="width:100%;border-collapse:collapse">';
  html += '<thead><tr>';
  ['Código', 'Nombre', 'Categoría', 'Marca', 'Precio Venta', 'Estado', 'Acciones'].forEach(h => {
    html += `<th style="text-align:left;padding:10px 12px;font-size:12px;color:var(--text-secondary);border-bottom:1px solid var(--border);background:var(--surface-alt)">${h}</th>`;
  });
  html += '</tr></thead><tbody>';

  for (const p of productos) {
    const estadoClass = p.estado === 'activo' ? 'badge-approved' : (p.estado === 'inactivo' ? 'badge-rejected' : 'badge-draft');
    const estadoLabel = p.estado === 'activo' ? '🟢 Activo' : (p.estado === 'inactivo' ? '🔴 Inactivo' : '⚫ Descontinuado');
    html += `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border-light);font-family:monospace;font-size:13px;font-weight:600">${esc(p.codigo)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border-light);font-weight:600">${esc(p.nombre)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border-light);font-size:13px">${esc(p.categoria || '-')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border-light);font-size:13px">${esc(p.marca || '-')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border-light);font-weight:600;color:var(--success)">${formatMoney(p.precioVenta)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border-light)"><span class="badge ${estadoClass}">${estadoLabel}</span></td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border-light)">
        <div style="display:flex;gap:4px">
          <button class="btn btn-sm" onclick="editarProducto('${p.id}')" title="Editar">✏️</button>
          <button class="btn btn-sm btn-danger" onclick="confirmarEliminarProducto('${p.id}', '${esc(p.nombre)}')" title="Eliminar">🗑</button>
        </div>
      </td>
    </tr>`;
  }
  html += '</tbody></table>';
  $('#tablaProductos').innerHTML = html;
}

function abrirModalProducto() {
  productoEditandoId = null;
  $('#modalProductoTitle').textContent = '📦 Nuevo Producto';
  $('#prodCodigo').value = '';
  $('#prodCategoria').value = '';
  $('#prodNombre').value = '';
  $('#prodMarca').value = '';
  $('#prodModelo').value = '';
  $('#prodDescripcion').value = '';
  $('#prodPrecioCompra').value = '0';
  $('#prodPrecioVenta').value = '0';
  $('#prodCostoInstalacion').value = '0';
  $('#prodImpuesto').value = '15';
  $('#prodEstado').value = 'activo';
  $('#prodImagen').value = '';
  $('#modalProducto').hidden = false;
  setTimeout(() => $('#prodCodigo').focus(), 100);
}

function cerrarModalProducto() {
  $('#modalProducto').hidden = true;
}

async function editarProducto(id) {
  const prod = await dbGet(STORES.productos, id);
  if (!prod) return;
  productoEditandoId = id;
  $('#modalProductoTitle').textContent = '📦 Editar Producto';
  $('#prodCodigo').value = prod.codigo || '';
  $('#prodCategoria').value = prod.categoria || '';
  $('#prodNombre').value = prod.nombre || '';
  $('#prodMarca').value = prod.marca || '';
  $('#prodModelo').value = prod.modelo || '';
  $('#prodDescripcion').value = prod.descripcion || '';
  $('#prodPrecioCompra').value = prod.precioCompra || 0;
  $('#prodPrecioVenta').value = prod.precioVenta || 0;
  $('#prodCostoInstalacion').value = prod.costoInstalacion || 0;
  $('#prodImpuesto').value = prod.impuesto || 15;
  $('#prodEstado').value = prod.estado || 'activo';
  $('#prodImagen').value = prod.imagen || '';
  $('#modalProducto').hidden = false;
}

async function guardarProductoForm() {
  const codigo = $('#prodCodigo').value.trim();
  const nombre = $('#prodNombre').value.trim();
  const categoria = $('#prodCategoria').value.trim();
  if (!codigo || !nombre || !categoria) {
    toast('Código, nombre y categoría son obligatorios', 'error');
    return;
  }

  const producto = {
    id: productoEditandoId || undefined,
    codigo,
    categoria,
    nombre,
    marca: $('#prodMarca').value.trim(),
    modelo: $('#prodModelo').value.trim(),
    descripcion: $('#prodDescripcion').value.trim(),
    precioCompra: parseFloat($('#prodPrecioCompra').value) || 0,
    precioVenta: parseFloat($('#prodPrecioVenta').value) || 0,
    costoInstalacion: parseFloat($('#prodCostoInstalacion').value) || 0,
    impuesto: parseFloat($('#prodImpuesto').value) || 15,
    estado: $('#prodEstado').value,
    imagen: $('#prodImagen').value.trim(),
  };

  await guardarProducto(producto);
  toast('Producto guardado correctamente', 'success');
  cerrarModalProducto();
  renderProductos();
}

function confirmarEliminarProducto(id, nombre) {
  $('#confirmTitle').textContent = '🗑 Eliminar Producto';
  $('#confirmMsg').textContent = `¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`;
  $('#confirmBtn').onclick = async () => {
    await eliminarProducto(id);
    toast('Producto eliminado', 'success');
    cerrarConfirm();
    renderProductos();
  };
  $('#modalConfirm').hidden = false;
}

function cerrarConfirm() {
  $('#modalConfirm').hidden = true;
}

/* ============ COTIZACIONES ============ */
let cotizacionEditandoId = null;
let cotizacionDetalles = [];
let detachIndex = 0;

async function renderCotizaciones() {
  const termino = $('#busquedaCotizaciones').value;
  const estado = $('#filtroEstadoCotizacion').value;
  const fechaFiltro = $('#filtroFechaCotizacion').value;

  let cotizaciones = await obtenerCotizaciones();
  const clientes = await obtenerClientes();
  const clienteMap = {};
  clientes.forEach(c => clienteMap[c.id] = c);

  // Filtros
  const t = normalizar(termino);
  if (t) {
    cotizaciones = cotizaciones.filter(c => {
      const cli = clienteMap[c.clienteId];
      return normalizar(c.numero).includes(t) ||
        (cli && normalizar(cli.nombre).includes(t)) ||
        normalizar(c.vendedor || '').includes(t);
    });
  }
  if (estado && estado !== 'todos') {
    cotizaciones = cotizaciones.filter(c => c.estado === estado);
  }
  if (fechaFiltro) {
    cotizaciones = cotizaciones.filter(c => c.fechaCreacion === fechaFiltro);
  }

  cotizaciones.sort((a, b) => (b.fechaCreacion || '').localeCompare(a.fechaCreacion || ''));

  if (cotizaciones.length === 0) {
    $('#tablaCotizaciones').innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📄</span>
        <h3>No hay cotizaciones</h3>
        <p>Crea tu primera cotización para comenzar</p>
        <button class="btn btn-primary" onclick="nuevaCotizacion()">➕ Nueva Cotización</button>
      </div>`;
    return;
  }

  let html = '<table style="width:100%;border-collapse:collapse">';
  html += '<thead><tr>';
  ['Número', 'Cliente', 'Fecha', 'Vencimiento', 'Estado', 'Total', 'Acciones'].forEach(h => {
    html += `<th style="text-align:left;padding:10px 12px;font-size:12px;color:var(--text-secondary);border-bottom:1px solid var(--border);background:var(--surface-alt);white-space:nowrap">${h}</th>`;
  });
  html += '</tr></thead><tbody>';

  for (const c of cotizaciones) {
    const cli = clienteMap[c.clienteId];
    const badge = getBadgeClass(c.estado);
    html += `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border-light);font-weight:600;font-size:13px;white-space:nowrap">${esc(c.numero)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border-light);font-size:13px">${esc(cli ? cli.nombre : 'Sin cliente')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border-light);font-size:13px;color:var(--text-secondary);white-space:nowrap">${formatearFecha(c.fechaCreacion)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border-light);font-size:13px;color:var(--text-secondary);white-space:nowrap">${formatearFecha(c.fechaVencimiento)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border-light)"><span class="badge ${badge}">${c.estado}</span></td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border-light);text-align:right;font-weight:600;font-size:13px;white-space:nowrap">${formatMoney(c.total)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border-light)">
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn btn-sm" onclick="editarCotizacion('${c.id}')" title="Editar">✏️</button>
          <button class="btn btn-sm" onclick="duplicarCotizacionAction('${c.id}')" title="Duplicar">📋</button>
          <button class="btn btn-sm" onclick="descargarPDF('${c.id}')" title="Descargar PDF">📥</button>
          <button class="btn btn-sm btn-danger" onclick="confirmarEliminarCotizacion('${c.id}', '${esc(c.numero)}')" title="Eliminar">🗑</button>
        </div>
      </td>
    </tr>`;
  }
  html += '</tbody></table>';
  html += `<div class="table-footer"><span>${cotizaciones.length} cotización(es) encontrada(s)</span></div>`;
  $('#tablaCotizaciones').innerHTML = html;
}

async function nuevaCotizacion() {
  cotizacionEditandoId = null;
  cotizacionDetalles = [];
  detachIndex = 0;

  $('#formCotizacionTitle').textContent = '📄 Nueva Cotización';
  $('#fCotNumero').value = await generarNumeroCotizacion();
  $('#fCotFecha').value = hoyISO();
  $('#fCotVencimiento').value = fechaMasDias(hoyISO(), 30);
  $('#fCotVendedor').value = '';
  $('#fCotEstado').value = 'borrador';
  $('#fCotManoObra').value = '0';
  $('#fCotTransporte').value = '0';
  $('#fCotMateriales').value = '0';
  $('#fCotOtros').value = '0';
  $('#fCotAlcance').value = '';
  $('#fCotObservaciones').value = '';

  await cargarSelectClientes();
  await cargarConfigObservaciones();

  renderDetalle();
  navegar('form-cotizacion');
}

async function cargarConfigObservaciones() {
  const config = await obtenerConfiguracion();
  if (config.observacionesDefault && !cotizacionEditandoId) {
    $('#fCotObservaciones').value = config.observacionesDefault;
  }
  $('#totImpPct').textContent = config.porcentajeImpuesto || 15;
}

async function cargarSelectClientes(selectedId) {
  const clientes = await obtenerClientes();
  clientes.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  const select = $('#fCotCliente');
  const actual = selectedId || select.value;
  select.innerHTML = '<option value="">Seleccionar cliente...</option>' +
    clientes.map(c => `<option value="${c.id}" ${c.id === actual ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('');
}

function onClienteChange() {
  // Placeholder for client change events
}

async function editarCotizacion(id) {
  const cotizacion = await obtenerCotizacionCompleta(id);
  if (!cotizacion) {
    toast('Cotización no encontrada', 'error');
    return;
  }

  cotizacionEditandoId = id;
  cotizacionDetalles = cotizacion.detalles || [];
  detachIndex = cotizacionDetalles.length;

  $('#formCotizacionTitle').textContent = `📄 Editar ${cotizacion.numero}`;
  $('#fCotNumero').value = cotizacion.numero || '';
  $('#fCotFecha').value = cotizacion.fechaCreacion || hoyISO();
  $('#fCotVencimiento').value = cotizacion.fechaVencimiento || fechaMasDias(hoyISO(), 30);
  $('#fCotVendedor').value = cotizacion.vendedor || '';
  $('#fCotEstado').value = cotizacion.estado || 'borrador';
  $('#fCotManoObra').value = cotizacion.manoObra || 0;
  $('#fCotTransporte').value = cotizacion.transporte || 0;
  $('#fCotMateriales').value = cotizacion.materialesAdicionales || 0;
  $('#fCotOtros').value = cotizacion.otrosCostos || 0;
  $('#fCotAlcance').value = cotizacion.alcanceProyecto || '';
  $('#fCotObservaciones').value = cotizacion.observaciones || '';

  await cargarSelectClientes(cotizacion.clienteId);

  renderDetalle();
  calcularTotales();
  navegar('form-cotizacion');
}

async function duplicarCotizacionAction(id) {
  const nueva = await duplicarCotizacion(id);
  if (nueva) {
    toast('Cotización duplicada como ' + nueva.numero, 'success');
    renderCotizaciones();
  }
}

function confirmarEliminarCotizacion(id, numero) {
  $('#confirmTitle').textContent = '🗑 Eliminar Cotización';
  $('#confirmMsg').textContent = `¿Eliminar la cotización ${numero}? Esta acción no se puede deshacer.`;
  $('#confirmBtn').onclick = async () => {
    await eliminarCotizacion(id);
    toast('Cotización eliminada', 'success');
    cerrarConfirm();
    renderCotizaciones();
  };
  $('#modalConfirm').hidden = false;
}

async function descargarPDF(id) {
  try {
    const nombre = await generarPDF(id);
    toast('PDF descargado: ' + nombre, 'success');
  } catch (e) {
    toast('Error al generar PDF: ' + e.message, 'error');
  }
}

/* ============ DETALLE DE COTIZACIÓN ============ */

function agregarDetalle() {
  const nuevo = {
    _localIndex: detachIndex++,
    cotizacionId: cotizacionEditandoId || '__pending__',
    productoId: '',
    codigo: '',
    nombre: '',
    descripcion: '',
    cantidad: 1,
    precioUnitario: 0,
    descuentoPorcentaje: 0,
    descuento: 0,
    subtotal: 0,
  };
  cotizacionDetalles.push(nuevo);
  renderDetalle();
  // Abrir selector
  abrirSeleccionarProducto(cotizacionDetalles.length - 1);
}

function renderDetalle() {
  const tbody = $('#detalleBody');
  const vacio = $('#detalleVacio');

  if (cotizacionDetalles.length === 0) {
    tbody.innerHTML = '';
    vacio.hidden = false;
    return;
  }

  vacio.hidden = true;
  let html = '';

  cotizacionDetalles.forEach((d, i) => {
    const subtotal = (d.precioUnitario || 0) * (d.cantidad || 0);
    const descMonto = d.descuentoPorcentaje ? subtotal * (d.descuentoPorcentaje / 100) : 0;
    const sub = subtotal - descMonto;
    d.subtotal = sub;

    html += `<tr>
      <td>
        <div style="font-weight:600;font-size:13px;cursor:pointer;color:var(--primary)" onclick="abrirSeleccionarProducto(${i})" title="Cambiar producto">${esc(d.codigo || 'Click para seleccionar')}</div>
        <div style="font-size:11px;color:var(--text-muted)">${d.productoId ? '✅ Seleccionado' : '⚠️ Sin producto'}</div>
      </td>
      <td>
        <input value="${esc(d.descripcion || d.nombre || '')}" placeholder="Descripción del producto/servicio"
          oninput="actualizarDetalle(${i}, 'descripcion', this.value)">
      </td>
      <td>
        <input type="number" min="1" step="1" value="${d.cantidad || 1}" style="text-align:center"
          oninput="actualizarDetalle(${i}, 'cantidad', parseFloat(this.value)||1)">
      </td>
      <td>
        <input type="number" min="0" step="0.01" value="${d.precioUnitario || 0}" style="text-align:right"
          oninput="actualizarDetalle(${i}, 'precioUnitario', parseFloat(this.value)||0)">
      </td>
      <td>
        <input type="number" min="0" max="100" step="0.1" value="${d.descuentoPorcentaje || 0}" style="text-align:center"
          oninput="actualizarDetalle(${i}, 'descuentoPorcentaje', parseFloat(this.value)||0)">
      </td>
      <td style="text-align:right;font-weight:600;white-space:nowrap">${formatMoney(sub)}</td>
      <td style="text-align:center">
        <button class="btn btn-sm btn-danger" onclick="eliminarDetalle(${i})" title="Eliminar">✕</button>
      </td>
    </tr>`;
  });

  tbody.innerHTML = html;
  calcularTotales();
}

function actualizarDetalle(index, campo, valor) {
  cotizacionDetalles[index][campo] = valor;
  renderDetalle();
}

function eliminarDetalle(index) {
  cotizacionDetalles.splice(index, 1);
  renderDetalle();
}

/* ============ SELECCIONAR PRODUCTO ============ */
let seleccionProductoIndex = -1;

function abrirSeleccionarProducto(index) {
  seleccionProductoIndex = index;
  $('#busquedaProductoCot').value = '';
  renderSeleccionarProducto();
  $('#modalSeleccionarProducto').hidden = false;
  setTimeout(() => $('#busquedaProductoCot').focus(), 100);
}

function cerrarSeleccionarProducto() {
  $('#modalSeleccionarProducto').hidden = true;
}

async function renderSeleccionarProducto() {
  const termino = $('#busquedaProductoCot').value;
  const productos = await buscarProductos(termino);

  const activos = productos.filter(p => p.estado === 'activo');
  const inactivos = productos.filter(p => p.estado !== 'activo');

  if (activos.length === 0 && inactivos.length === 0) {
    $('#listaSeleccionarProducto').innerHTML = `
      <div class="empty-state" style="padding:20px">
        <p>No se encontraron productos</p>
      </div>`;
    return;
  }

  let html = '';

  activos.forEach(p => {
    html += `<div class="search-result-item" onclick="seleccionarProducto('${p.id}', ${seleccionProductoIndex})">
      <div>
        <div class="product-name">${esc(p.nombre)}</div>
        <div class="product-code">${esc(p.codigo)} · ${esc(p.categoria || '')} ${p.marca ? '· ' + esc(p.marca) : ''}</div>
      </div>
      <div class="product-price">${formatMoney(p.precioVenta)}</div>
    </div>`;
  });

  if (inactivos.length > 0) {
    html += `<div style="padding:8px 14px;font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:600;border-bottom:1px solid var(--border);background:var(--surface-alt)">Inactivos / Descontinuados</div>`;
    inactivos.forEach(p => {
      html += `<div class="search-result-item" style="opacity:.6" onclick="seleccionarProducto('${p.id}', ${seleccionProductoIndex})">
        <div>
          <div class="product-name">${esc(p.nombre)}</div>
          <div class="product-code">${esc(p.codigo)} · ${esc(p.categoria || '')}</div>
        </div>
        <div class="product-price">${formatMoney(p.precioVenta)}</div>
      </div>`;
    });
  }

  $('#listaSeleccionarProducto').innerHTML = html;
}

async function seleccionarProducto(productoId, index) {
  const prod = await dbGet(STORES.productos, productoId);
  if (!prod) return;

  cotizacionDetalles[index].productoId = prod.id;
  cotizacionDetalles[index].codigo = prod.codigo;
  cotizacionDetalles[index].nombre = prod.nombre;
  cotizacionDetalles[index].descripcion = prod.descripcion || prod.nombre;
  cotizacionDetalles[index].precioUnitario = prod.precioVenta || 0;

  cerrarSeleccionarProducto();
  renderDetalle();
}

/* ============ CÁLCULOS AUTOMÁTICOS ============ */

async function calcularTotales() {
  const config = await obtenerConfiguracion();
  const impPct = config.porcentajeImpuesto || 15;

  let subtotal = 0;
  let descuentoTotal = 0;
  let impuestoTotal = 0;

  cotizacionDetalles.forEach(d => {
    const precio = d.precioUnitario || 0;
    const cant = d.cantidad || 0;
    const lineSubtotal = precio * cant;
    const descPct = d.descuentoPorcentaje || 0;
    const descMonto = lineSubtotal * (descPct / 100);
    const lineNeto = lineSubtotal - descMonto;
    const lineImp = lineNeto * (impPct / 100);

    subtotal += lineSubtotal;
    descuentoTotal += descMonto;
    impuestoTotal += lineImp;
  });

  const manoObra = parseFloat($('#fCotManoObra').value) || 0;
  const transporte = parseFloat($('#fCotTransporte').value) || 0;
  const materiales = parseFloat($('#fCotMateriales').value) || 0;
  const otros = parseFloat($('#fCotOtros').value) || 0;
  const total = subtotal - descuentoTotal + impuestoTotal + manoObra + transporte + materiales + otros;

  $('#totSubtotal').textContent = formatMoney(subtotal);
  $('#totDescuento').textContent = formatMoney(descuentoTotal);
  $('#totImpPct').textContent = impPct;
  $('#totImpuesto').textContent = formatMoney(impuestoTotal);
  $('#totManoObra').textContent = formatMoney(manoObra);
  $('#totTransporte').textContent = formatMoney(transporte);
  $('#totMateriales').textContent = formatMoney(materiales);
  $('#totOtros').textContent = formatMoney(otros);
  $('#totGeneral').textContent = formatMoney(total);
}

/* ============ GUARDAR COTIZACIÓN ============ */

async function guardarCotizacionForm() {
  const config = await obtenerConfiguracion();
  const impPct = config.porcentajeImpuesto || 15;

  const clienteId = $('#fCotCliente').value;
  if (!clienteId) {
    toast('Selecciona un cliente', 'error');
    return;
  }

  if (cotizacionDetalles.length === 0) {
    toast('Agrega al menos un producto o servicio', 'error');
    return;
  }

  // Calcular totales
  let subtotal = 0, descuentoTotal = 0, impuestoTotal = 0;
  cotizacionDetalles.forEach(d => {
    const lineSubtotal = (d.precioUnitario || 0) * (d.cantidad || 0);
    const descMonto = lineSubtotal * ((d.descuentoPorcentaje || 0) / 100);
    const lineNeto = lineSubtotal - descMonto;
    subtotal += lineSubtotal;
    descuentoTotal += descMonto;
    impuestoTotal += lineNeto * (impPct / 100);
  });

  const manoObra = parseFloat($('#fCotManoObra').value) || 0;
  const transporte = parseFloat($('#fCotTransporte').value) || 0;
  const materiales = parseFloat($('#fCotMateriales').value) || 0;
  const otros = parseFloat($('#fCotOtros').value) || 0;
  const total = subtotal - descuentoTotal + impuestoTotal + manoObra + transporte + materiales + otros;

  const cotizacion = {
    id: cotizacionEditandoId || undefined,
    numero: $('#fCotNumero').value,
    fechaCreacion: $('#fCotFecha').value,
    fechaVencimiento: $('#fCotVencimiento').value,
    clienteId,
    vendedor: $('#fCotVendedor').value.trim(),
    estado: $('#fCotEstado').value,
    subtotal,
    descuento: descuentoTotal,
    impuesto: impuestoTotal,
    manoObra,
    transporte,
    materialesAdicionales: materiales,
    otrosCostos: otros,
    total,
    alcanceProyecto: $('#fCotAlcance').value,
    observaciones: $('#fCotObservaciones').value,
  };

  // Si es nueva, generar ID primero
  if (!cotizacion.id) {
    cotizacion.id = generarId();
    cotizacion.fechaCreacion = cotizacion.fechaCreacion || hoyISO();
    cotizacion.numero = cotizacion.numero || await generarNumeroCotizacion();
  }
  cotizacion.fechaModificacion = hoyISO();

  await guardarCotizacion(cotizacion);

  // Guardar detalles
  if (cotizacionEditandoId) {
    // Eliminar detalles anteriores y reemplazar
    await eliminarDetallesCotizacion(cotizacion.id);
  }

  for (const d of cotizacionDetalles) {
    const det = {
      id: generarId(),
      cotizacionId: cotizacion.id,
      productoId: d.productoId,
      codigo: d.codigo,
      nombre: d.nombre,
      descripcion: d.descripcion,
      cantidad: d.cantidad,
      precioUnitario: d.precioUnitario,
      descuentoPorcentaje: d.descuentoPorcentaje,
      subtotal: d.subtotal,
    };
    await guardarDetalleCotizacion(det);
  }

  toast('Cotización guardada correctamente', 'success');
  navegar('cotizaciones');
}

/* ============ CONFIGURACIÓN ============ */

let logoDataUrl = null;

async function renderConfiguracion() {
  const config = await obtenerConfiguracion();
  $('#cfgNombre').value = config.nombreEmpresa || '';
  $('#cfgRtn').value = config.rtnEmpresa || '';
  $('#cfgDireccion').value = config.direccionEmpresa || '';
  $('#cfgTelefono').value = config.telefonoEmpresa || '';
  $('#cfgEmail').value = config.emailEmpresa || '';
  $('#cfgImpuesto').value = config.porcentajeImpuesto ?? 15;
  $('#cfgDiasVigencia').value = config.diasVigencia ?? 30;
  $('#cfgObservaciones').value = config.observacionesDefault || '';
  logoDataUrl = config.logoEmpresa || null;
  actualizarLogoPreview();
}

function cargarLogo(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    logoDataUrl = e.target.result;
    actualizarLogoPreview();
  };
  reader.readAsDataURL(file);
}

function quitarLogo() {
  logoDataUrl = null;
  actualizarLogoPreview();
  $('#cfgLogoFile').value = '';
}

function actualizarLogoPreview() {
  const preview = $('#cfgLogoPreview');
  if (logoDataUrl) {
    preview.innerHTML = `<img src="${logoDataUrl}" alt="Logo">`;
  } else {
    preview.innerHTML = '<span class="placeholder">🏢</span>';
  }
}

async function guardarConfig() {
  const config = {
    id: 'default',
    nombreEmpresa: $('#cfgNombre').value.trim(),
    rtnEmpresa: $('#cfgRtn').value.trim(),
    direccionEmpresa: $('#cfgDireccion').value.trim(),
    telefonoEmpresa: $('#cfgTelefono').value.trim(),
    emailEmpresa: $('#cfgEmail').value.trim(),
    logoEmpresa: logoDataUrl || '',
    porcentajeImpuesto: parseFloat($('#cfgImpuesto').value) || 15,
    diasVigencia: parseInt($('#cfgDiasVigencia').value) || 30,
    observacionesDefault: $('#cfgObservaciones').value,
  };

  await guardarConfiguracion(config);
  toast('Configuración guardada', 'success');
}

/* ============ INICIALIZACIÓN ============ */

document.addEventListener('DOMContentLoaded', async () => {
  // Inicializar base de datos
  await abrirBD();
  navegar('dashboard');
});
