/**
 * ===== Limpieza.gs =====
 * Entregado, devuelto y eliminado ya no aportan nada al día a día — dejarlos
 * para siempre en la hoja solo la hace más pesada y lenta. Esto borra (de
 * verdad, la fila completa) lo que lleve más de DIAS_RETENCION_CERRADOS días
 * cerrado. Puede correr sola cada madrugada (trigger de tiempo) o a pedido
 * desde el botón "Limpiar ahora" de Ajustes.
 */

function limpiarRegistrosAntiguos() {
  const ss = obtenerLibro();
  const sheet = ss.getSheetByName(HOJA_PAQUETES);
  const ultimaFila = sheet.getLastRow();
  if (ultimaFila < FILA_ENCABEZADO + 1) return { eliminados: 0 };

  const data = sheet.getRange(FILA_ENCABEZADO + 1, 1, ultimaFila - FILA_ENCABEZADO, 8).getValues();
  const limite = new Date();
  limite.setDate(limite.getDate() - DIAS_RETENCION_CERRADOS);

  const filasABorrar = [];
  for (let i = 0; i < data.length; i++) {
    const estatus = String(data[i][5] || '').trim().toUpperCase();
    if (ESTATUS_CERRADOS.indexOf(estatus) === -1) continue;
    const fechaSalida = data[i][7] ? new Date(data[i][7]) : null;
    if (fechaSalida && fechaSalida < limite) {
      filasABorrar.push(FILA_ENCABEZADO + 1 + i);
    }
  }

  // De abajo hacia arriba para no desfasar los números de fila que faltan por borrar.
  filasABorrar.sort((a, b) => b - a).forEach(numFila => sheet.deleteRow(numFila));
  return { eliminados: filasABorrar.length };
}

function ejecutarLimpiezaManual() {
  return ejecutarSeguro_(() => limpiarRegistrosAntiguos());
}

function instalarLimpiezaAutomatica() {
  return ejecutarSeguro_(() => {
    ScriptApp.getProjectTriggers().forEach(t => {
      if (t.getHandlerFunction() === NOMBRE_TRIGGER_LIMPIEZA) ScriptApp.deleteTrigger(t);
    });
    ScriptApp.newTrigger(NOMBRE_TRIGGER_LIMPIEZA).timeBased().everyDays(1).atHour(3).create();
    return { activo: true };
  });
}

function desinstalarLimpiezaAutomatica() {
  return ejecutarSeguro_(() => {
    ScriptApp.getProjectTriggers().forEach(t => {
      if (t.getHandlerFunction() === NOMBRE_TRIGGER_LIMPIEZA) ScriptApp.deleteTrigger(t);
    });
    return { activo: false };
  });
}

function obtenerEstadoLimpiezaAutomatica() {
  return ejecutarSeguro_(() => {
    const activo = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === NOMBRE_TRIGGER_LIMPIEZA);
    return { activo: activo, diasRetencion: DIAS_RETENCION_CERRADOS };
  });
}