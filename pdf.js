/* ============================================================
   CotizaPro — Generación de PDF profesional
   Requiere: jsPDF y jsPDF-AutoTable (CDN)
   ============================================================ */

async function generarPDF(cotizacionId) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'letter');
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 18;
  const contentW = pageW - marginX * 2;
  let y = 0;

  // Obtener datos
  const cotizacion = await obtenerCotizacionCompleta(cotizacionId);
  const config = await obtenerConfiguracion();
  const cliente = cotizacion.clienteId ? await dbGet(STORES.clientes, cotizacion.clienteId) : null;

  const colores = {
    primary: [30, 64, 175],
    dark: [15, 23, 42],
    muted: [100, 116, 139],
    light: [241, 245, 249],
    success: [5, 150, 105],
    white: [255, 255, 255],
  };

  // ---- Logo y encabezado de empresa ----
  if (config.logoEmpresa) {
    try {
      doc.addImage(config.logoEmpresa, 'PNG', marginX, 10, 30, 30);
    } catch (e) {
      // Si el logo falla, continuar sin él
    }
    y = 12;
    doc.setFontSize(10);
    doc.setTextColor(...colores.muted);
    const textX = config.logoEmpresa ? marginX + 35 : marginX;
    if (config.nombreEmpresa) {
      doc.setFontSize(18);
      doc.setTextColor(...colores.dark);
      doc.setFont('helvetica', 'bold');
      doc.text(config.nombreEmpresa, textX, y + 8);
    }
    y += 14;
    doc.setFontSize(9);
    doc.setTextColor(...colores.muted);
    doc.setFont('helvetica', 'normal');
    const contactLines = [
      config.rtnEmpresa ? `RTN: ${config.rtnEmpresa}` : null,
      config.direccionEmpresa,
      config.telefonoEmpresa ? `Tel: ${config.telefonoEmpresa}` : null,
      config.emailEmpresa ? `Email: ${config.emailEmpresa}` : null,
    ].filter(Boolean);
    contactLines.forEach(line => {
      doc.text(line, textX, y);
      y += 4;
    });
  } else {
    y = 14;
    if (config.nombreEmpresa) {
      doc.setFontSize(20);
      doc.setTextColor(...colores.primary);
      doc.setFont('helvetica', 'bold');
      doc.text(config.nombreEmpresa, marginX, y);
      y += 8;
    }
    doc.setFontSize(9);
    doc.setTextColor(...colores.muted);
    doc.setFont('helvetica', 'normal');
    const contactLines = [
      config.rtnEmpresa ? `RTN: ${config.rtnEmpresa}` : null,
      config.direccionEmpresa,
      config.telefonoEmpresa ? `Tel: ${config.telefonoEmpresa}` : null,
      config.emailEmpresa ? `Email: ${config.emailEmpresa}` : null,
    ].filter(Boolean);
    contactLines.forEach(line => {
      doc.text(line, marginX, y);
      y += 4;
    });
  }

  // ---- Línea separadora ----
  y += 4;
  doc.setDrawColor(...colores.primary);
  doc.setLineWidth(0.5);
  doc.line(marginX, y, pageW - marginX, y);
  y += 8;

  // ---- Título de cotización ----
  doc.setFontSize(16);
  doc.setTextColor(...colores.primary);
  doc.setFont('helvetica', 'bold');
  doc.text('COTIZACIÓN', marginX, y);
  y += 8;

  // ---- Info de la cotización y del cliente ----
  const leftCol = marginX;
  const rightCol = pageW / 2 + 10;
  const infoStartY = y;

  // Datos de la cotización (derecha)
  doc.setFontSize(9);
  doc.setTextColor(...colores.muted);
  doc.setFont('helvetica', 'normal');

  const cotInfo = [
    ['Número:', cotizacion.numero],
    ['Fecha:', formatearFecha(cotizacion.fechaCreacion)],
    ['Vencimiento:', formatearFecha(cotizacion.fechaVencimiento)],
    ['Estado:', cotizacion.estado ? cotizacion.estado.charAt(0).toUpperCase() + cotizacion.estado.slice(1) : ''],
    ['Vendedor:', cotizacion.vendedor || 'N/A'],
  ];

  let ri = infoStartY;
  cotInfo.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, rightCol, ri);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value || 'N/A'), rightCol + 28, ri);
    ri += 5;
  });

  // Datos del cliente (izquierda)
  if (cliente) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...colores.dark);
    doc.text('CLIENTE', leftCol, infoStartY - 1);
    doc.setFontSize(9);
    doc.setTextColor(...colores.muted);
    doc.setFont('helvetica', 'normal');

    const clientInfo = [
      cliente.nombre,
      cliente.rtn ? `RTN: ${cliente.rtn}` : null,
      cliente.direccion,
      cliente.telefono ? `Tel: ${cliente.telefono}` : null,
      cliente.email ? `Email: ${cliente.email}` : null,
      cliente.contacto ? `Contacto: ${cliente.contacto}` : null,
    ].filter(Boolean);

    let ci = infoStartY + 5;
    clientInfo.forEach(line => {
      doc.text(line, leftCol, ci);
      ci += 4.5;
    });
    ri = Math.max(ri, ci);
  }

  y = ri + 8;

  // ---- Tabla de productos ----
  if (cotizacion.detalles && cotizacion.detalles.length > 0) {
    const tableData = cotizacion.detalles.map((d, i) => [
      String(i + 1),
      d.codigo || '',
      d.descripcion || d.nombre || '',
      String(d.cantidad || 0),
      formatNumber(d.precioUnitario),
      d.descuentoPorcentaje ? `${d.descuentoPorcentaje}%` : (d.descuento ? formatNumber(d.descuento) : '-'),
      formatNumber(d.subtotal || ((d.precioUnitario || 0) * (d.cantidad || 0))),
    ]);

    doc.autoTable({
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['#', 'Código', 'Descripción', 'Cant.', 'P. Unitario', 'Desc.', 'Subtotal']],
      body: tableData,
      styles: {
        fontSize: 9,
        cellPadding: 4,
        textColor: colores.dark,
        lineColor: [226, 232, 240],
        lineWidth: 0.3,
      },
      headStyles: {
        fillColor: colores.primary,
        textColor: colores.white,
        fontStyle: 'bold',
        fontSize: 8,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 22 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 16, halign: 'center' },
        4: { cellWidth: 28, halign: 'right' },
        5: { cellWidth: 20, halign: 'center' },
        6: { cellWidth: 28, halign: 'right' },
      },
      didParseCell: function(data) {
        if (data.section === 'body') {
          data.cell.styles.fontSize = 8.5;
        }
      },
    });

    y = doc.lastAutoTable.finalY + 6;
  }

  // ---- Totales ----
  const subtotal = cotizacion.subtotal || 0;
  const descuento = cotizacion.descuento || 0;
  const impuestoMonto = cotizacion.impuesto || 0;
  const manoObra = cotizacion.manoObra || 0;
  const transporte = cotizacion.transporte || 0;
  const materiales = cotizacion.materialesAdicionales || 0;
  const otros = cotizacion.otrosCostos || 0;
  const total = cotizacion.total || (subtotal - descuento + impuestoMonto + manoObra + transporte + materiales + otros);

  const totalsX = pageW - marginX - 90;
  const valsX = pageW - marginX - 5;

  doc.setFontSize(9);
  doc.setTextColor(...colores.muted);
  doc.setFont('helvetica', 'normal');

  const totales = [
    ['Subtotal:', formatNumber(subtotal)],
  ];
  if (descuento > 0) totales.push(['Descuento:', '-' + formatNumber(descuento)]);
  if (impuestoMonto > 0) totales.push([`Impuesto (${config.porcentajeImpuesto || 15}%):`, formatNumber(impuestoMonto)]);
  if (manoObra > 0) totales.push(['Mano de Obra:', formatNumber(manoObra)]);
  if (transporte > 0) totales.push(['Transporte:', formatNumber(transporte)]);
  if (materiales > 0) totales.push(['Materiales Adic.:', formatNumber(materiales)]);
  if (otros > 0) totales.push(['Otros Costos:', formatNumber(otros)]);

  totales.forEach(([label, value]) => {
    doc.text(label, totalsX, y);
    doc.text(value, valsX, y, { align: 'right' });
    y += 5;
  });

  // Total general
  y += 2;
  doc.setDrawColor(...colores.primary);
  doc.setLineWidth(0.5);
  doc.line(totalsX - 4, y, valsX + 2, y);
  y += 7;

  doc.setFontSize(14);
  doc.setTextColor(...colores.primary);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL:', totalsX, y);
  doc.text(formatNumber(total), valsX, y, { align: 'right' });
  y += 12;

  // ---- Alcance del proyecto ----
  if (cotizacion.alcanceProyecto && cotizacion.alcanceProyecto.trim()) {
    if (y > 200) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(11);
    doc.setTextColor(...colores.primary);
    doc.setFont('helvetica', 'bold');
    doc.text('ALCANCE DEL PROYECTO', marginX, y);
    y += 7;

    doc.setFontSize(9);
    doc.setTextColor(...colores.dark);
    doc.setFont('helvetica', 'normal');
    const alcanceLines = doc.splitTextToSize(cotizacion.alcanceProyecto, contentW);
    doc.text(alcanceLines, marginX, y);
    y += alcanceLines.length * 4.5 + 8;
  }

  // ---- Condiciones y observaciones ----
  if (cotizacion.observaciones && cotizacion.observaciones.trim()) {
    if (y > 210) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(11);
    doc.setTextColor(...colores.primary);
    doc.setFont('helvetica', 'bold');
    doc.text('CONDICIONES Y OBSERVACIONES', marginX, y);
    y += 7;

    doc.setFontSize(9);
    doc.setTextColor(...colores.dark);
    doc.setFont('helvetica', 'normal');
    const obsLines = doc.splitTextToSize(cotizacion.observaciones, contentW);
    doc.text(obsLines, marginX, y);
    y += obsLines.length * 4.5 + 10;
  }

  // ---- Espacio para firma ----
  if (y > 210) {
    doc.addPage();
    y = 20;
  }

  y += 10;
  const firmaY = Math.max(y, 240);
  doc.setDrawColor(...colores.muted);
  doc.setLineWidth(0.3);

  // Firma cliente
  const firmaW = 70;
  doc.line(marginX, firmaY, marginX + firmaW, firmaY);
  doc.setFontSize(8);
  doc.setTextColor(...colores.muted);
  doc.text('Firma del Cliente', marginX + firmaW / 2, firmaY + 5, { align: 'center' });

  // Firma empresa
  doc.line(pageW - marginX - firmaW, firmaY, pageW - marginX, firmaY);
  doc.text('Firma Autorizada', pageW - marginX - firmaW / 2, firmaY + 5, { align: 'center' });

  // Fecha firma
  doc.text('Fecha: _______________', marginX + firmaW / 2, firmaY + 10, { align: 'center' });
  doc.text('Fecha: _______________', pageW - marginX - firmaW / 2, firmaY + 10, { align: 'center' });

  // ---- Pie de página ----
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFontSize(7);
    doc.setTextColor(...colores.muted);
    doc.setFont('helvetica', 'normal');
    doc.text(`${config.nombreEmpresa || 'CotizaPro'} — Cotización ${cotizacion.numero}`, marginX, pageH - 10);
    doc.text(`Página ${i} de ${totalPages}`, pageW - marginX, pageH - 10, { align: 'right' });
  }

  // ---- Guardar / descargar ----
  const nombreArchivo = `Cotizacion_${(cotizacion.numero || 'sin-numero').replace(/\//g, '-')}.pdf`;
  doc.save(nombreArchivo);

  return nombreArchivo;
}

/* ---- Previsualizar PDF en nueva pestaña ---- */
async function previsualizarPDF(cotizacionId) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'letter');
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 18;
  const contentW = pageW - marginX * 2;
  let y = 0;

  const cotizacion = await obtenerCotizacionCompleta(cotizacionId);
  const config = await obtenerConfiguracion();
  const cliente = cotizacion.clienteId ? await dbGet(STORES.clientes, cotizacion.clienteId) : null;

  const colores = {
    primary: [30, 64, 175],
    dark: [15, 23, 42],
    muted: [100, 116, 139],
    white: [255, 255, 255],
  };

  // Logo y empresa
  if (config.logoEmpresa) {
    try {
      doc.addImage(config.logoEmpresa, 'PNG', marginX, 10, 30, 30);
    } catch (e) {}
    y = 12;
    const textX = marginX + 35;
    if (config.nombreEmpresa) {
      doc.setFontSize(18);
      doc.setTextColor(...colores.dark);
      doc.setFont('helvetica', 'bold');
      doc.text(config.nombreEmpresa, textX, y + 8);
    }
    y += 14;
    doc.setFontSize(9);
    doc.setTextColor(...colores.muted);
    doc.setFont('helvetica', 'normal');
    [config.rtnEmpresa ? `RTN: ${config.rtnEmpresa}` : null, config.direccionEmpresa, config.telefonoEmpresa ? `Tel: ${config.telefonoEmpresa}` : null, config.emailEmpresa ? `Email: ${config.emailEmpresa}` : null].filter(Boolean).forEach(l => { doc.text(l, textX, y); y += 4; });
  } else {
    y = 14;
    if (config.nombreEmpresa) {
      doc.setFontSize(20);
      doc.setTextColor(...colores.primary);
      doc.setFont('helvetica', 'bold');
      doc.text(config.nombreEmpresa, marginX, y); y += 8;
    }
    doc.setFontSize(9);
    doc.setTextColor(...colores.muted);
    doc.setFont('helvetica', 'normal');
    [config.rtnEmpresa ? `RTN: ${config.rtnEmpresa}` : null, config.direccionEmpresa, config.telefonoEmpresa ? `Tel: ${config.telefonoEmpresa}` : null, config.emailEmpresa ? `Email: ${config.emailEmpresa}` : null].filter(Boolean).forEach(l => { doc.text(l, marginX, y); y += 4; });
  }

  y += 4;
  doc.setDrawColor(...colores.primary);
  doc.setLineWidth(0.5);
  doc.line(marginX, y, pageW - marginX, y);
  y += 8;

  doc.setFontSize(16);
  doc.setTextColor(...colores.primary);
  doc.setFont('helvetica', 'bold');
  doc.text('COTIZACIÓN', marginX, y);
  y += 8;

  // Info
  const rightCol = pageW / 2 + 10;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  let ri = y;
  [['Número:', cotizacion.numero], ['Fecha:', formatearFecha(cotizacion.fechaCreacion)], ['Vencimiento:', formatearFecha(cotizacion.fechaVencimiento)], ['Estado:', (cotizacion.estado || '').charAt(0).toUpperCase() + (cotizacion.estado || '').slice(1)], ['Vendedor:', cotizacion.vendedor || 'N/A']].forEach(([l, v]) => {
    doc.setTextColor(...colores.muted);
    doc.setFont('helvetica', 'bold');
    doc.text(l, rightCol, ri);
    doc.setFont('helvetica', 'normal');
    doc.text(String(v || 'N/A'), rightCol + 28, ri);
    ri += 5;
  });

  if (cliente) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...colores.dark);
    doc.text('CLIENTE', marginX, y - 1);
    doc.setFontSize(9);
    doc.setTextColor(...colores.muted);
    doc.setFont('helvetica', 'normal');
    let ci = y + 5;
    [cliente.nombre, cliente.rtn ? `RTN: ${cliente.rtn}` : null, cliente.direccion, cliente.telefono ? `Tel: ${cliente.telefono}` : null, cliente.email ? `Email: ${cliente.email}` : null, cliente.contacto ? `Contacto: ${cliente.contacto}` : null].filter(Boolean).forEach(l => { doc.text(l, marginX, ci); ci += 4.5; });
    ri = Math.max(ri, ci);
  }
  y = ri + 8;

  // Tabla
  if (cotizacion.detalles && cotizacion.detalles.length > 0) {
    const tableData = cotizacion.detalles.map((d, i) => [String(i + 1), d.codigo || '', d.descripcion || d.nombre || '', String(d.cantidad || 0), formatNumber(d.precioUnitario), d.descuentoPorcentaje ? `${d.descuentoPorcentaje}%` : (d.descuento ? formatNumber(d.descuento) : '-'), formatNumber(d.subtotal || ((d.precioUnitario || 0) * (d.cantidad || 0)))]);

    doc.autoTable({
      startY: y, margin: { left: marginX, right: marginX },
      head: [['#', 'Código', 'Descripción', 'Cant.', 'P. Unitario', 'Desc.', 'Subtotal']],
      body: tableData,
      styles: { fontSize: 9, cellPadding: 4, textColor: colores.dark, lineColor: [226, 232, 240], lineWidth: 0.3 },
      headStyles: { fillColor: colores.primary, textColor: colores.white, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 22 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 16, halign: 'center' }, 4: { cellWidth: 28, halign: 'right' }, 5: { cellWidth: 20, halign: 'right' }, 6: { cellWidth: 28, halign: 'right' } },
      didParseCell: function(data) { if (data.section === 'body') data.cell.styles.fontSize = 8.5; },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // Totales
  const subtotal = cotizacion.subtotal || 0;
  const descuento = cotizacion.descuento || 0;
  const impuestoMonto = cotizacion.impuesto || 0;
  const manoObra = cotizacion.manoObra || 0;
  const transporte = cotizacion.transporte || 0;
  const materiales = cotizacion.materialesAdicionales || 0;
  const otros = cotizacion.otrosCostos || 0;
  const total = cotizacion.total || (subtotal - descuento + impuestoMonto + manoObra + transporte + materiales + otros);

  const totalsX = pageW - marginX - 90;
  const valsX = pageW - marginX - 5;
  doc.setFontSize(9);
  doc.setTextColor(...colores.muted);
  doc.setFont('helvetica', 'normal');

  const totales = [['Subtotal:', formatNumber(subtotal)]];
  if (descuento > 0) totales.push(['Descuento:', '-' + formatNumber(descuento)]);
  if (impuestoMonto > 0) totales.push([`Impuesto (${config.porcentajeImpuesto || 15}%):`, formatNumber(impuestoMonto)]);
  if (manoObra > 0) totales.push(['Mano de Obra:', formatNumber(manoObra)]);
  if (transporte > 0) totales.push(['Transporte:', formatNumber(transporte)]);
  if (materiales > 0) totales.push(['Materiales Adic.:', formatNumber(materiales)]);
  if (otros > 0) totales.push(['Otros Costos:', formatNumber(otros)]);

  totales.forEach(([l, v]) => { doc.text(l, totalsX, y); doc.text(v, valsX, y, { align: 'right' }); y += 5; });
  y += 2;
  doc.setDrawColor(...colores.primary);
  doc.setLineWidth(0.5);
  doc.line(totalsX - 4, y, valsX + 2, y);
  y += 7;
  doc.setFontSize(14);
  doc.setTextColor(...colores.primary);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL:', totalsX, y);
  doc.text(formatNumber(total), valsX, y, { align: 'right' });
  y += 12;

  // Alcance
  if (cotizacion.alcanceProyecto && cotizacion.alcanceProyecto.trim()) {
    if (y > 200) { doc.addPage(); y = 20; }
    doc.setFontSize(11); doc.setTextColor(...colores.primary); doc.setFont('helvetica', 'bold');
    doc.text('ALCANCE DEL PROYECTO', marginX, y); y += 7;
    doc.setFontSize(9); doc.setTextColor(...colores.dark); doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(cotizacion.alcanceProyecto, contentW);
    doc.text(lines, marginX, y); y += lines.length * 4.5 + 8;
  }

  // Observaciones
  if (cotizacion.observaciones && cotizacion.observaciones.trim()) {
    if (y > 210) { doc.addPage(); y = 20; }
    doc.setFontSize(11); doc.setTextColor(...colores.primary); doc.setFont('helvetica', 'bold');
    doc.text('CONDICIONES Y OBSERVACIONES', marginX, y); y += 7;
    doc.setFontSize(9); doc.setTextColor(...colores.dark); doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(cotizacion.observaciones, contentW);
    doc.text(lines, marginX, y); y += lines.length * 4.5 + 10;
  }

  // Firma
  if (y > 210) { doc.addPage(); y = 20; }
  y += 10;
  const firmaY = Math.max(y, 240);
  doc.setDrawColor(...colores.muted); doc.setLineWidth(0.3);
  doc.line(marginX, firmaY, marginX + 70, firmaY);
  doc.setFontSize(8); doc.setTextColor(...colores.muted); doc.text('Firma del Cliente', marginX + 35, firmaY + 5, { align: 'center' });
  doc.line(pageW - marginX - 70, firmaY, pageW - marginX, firmaY);
  doc.text('Firma Autorizada', pageW - marginX - 35, firmaY + 5, { align: 'center' });

  // Abrir en nueva pestaña
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
