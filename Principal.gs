/**
 * ===========================================================================
 *  AGENCIA MERCADO LIBRE PRO — backend (Google Apps Script)
 * ===========================================================================
 *  v{VERSION_APP} — ver Constantes.gs
 *
 *  QUÉ ES ESTO
 *  -----------
 *  Sistema de control de paquetería para una agencia de recolección de
 *  Mercado Libre: registra la entrada de paquetes (con pistola lectora),
 *  los ubica en un tablero de estantes, permite auditarlos físicamente y
 *  marcarlos como entregados o devueltos al chofer.
 *
 *  CÓMO ESTÁ ORGANIZADO EL BACKEND (archivos .gs)
 *  -----------------------------------------------
 *  Apps Script comparte el mismo espacio global entre TODOS los archivos
 *  .gs de un proyecto — no existen "imports"; una función definida en
 *  cualquier archivo puede usarse desde cualquier otro. La división en
 *  archivos de aquí en adelante es solo organizativa (facilita encontrar
 *  código), no cambia en nada cómo funciona la app:
 *
 *    - Constantes.gs    → nombres de hoja, columnas, estatus, PropertiesService.
 *    - Principal.gs     → (este archivo) doGet, utilidades base, inicialización.
 *    - Paquetes.gs      → todo lo que lee/escribe la hoja PAQUETES.
 *    - Estantes.gs      → la lista de estantes y su acomodo (tablero drag & drop).
 *    - Configuracion.gs → marca, modo demo, cámara — todo lo de Ajustes.
 *    - Limpieza.gs      → borrado automático de registros cerrados y viejos.
 *
 *  PÁGINAS (archivos .html)
 *  -------------------------
 *    - Index.html      → pantalla de laptop: Mostrador, Acomodar, Auditoría,
 *                        Buscar, Por Vencer, Cierre.
 *    - Movil.html      → pantalla de celular: solo Auditoría.
 *    - Ajustes.html    → configuración del negocio (marca, estantes, demo...).
 *    - Compartido.html → funciones de JS reutilizadas por las 3 páginas de
 *                        arriba (ver el encabezado de ese archivo).
 *
 *  LA HOJA "PAQUETES" (estructura de columnas)
 *  --------------------------------------------
 *  Fila 1-2: encabezados decorativos. Fila 3: títulos de columna. Desde la
 *  fila 4 en adelante, un renglón por paquete:
 *
 *    A) UTD              — últimos 3-5 dígitos de la guía (configurable).
 *    B) NOMBRE           — nombre del cliente (opcional).
 *    C) GUIA             — número de guía completo de Mercado Libre.
 *    D) EMBALAJE         — estante donde está, escrito como "( A1 )".
 *    E) CARACTERISTICAS  — notas libres (ej. "CAJA, FRÁGIL").
 *    F) ESTATUS          — uno de los 4 valores en ESTADOS (Constantes.gs).
 *    G) FECHA ENTRADA    — cuándo se escaneó.
 *    H) FECHA SALIDA     — cuándo se entregó/devolvió/eliminó (vacío si sigue EN_TIENDA).
 *
 *  Los estantes viven en una hoja aparte, CONFIG_ESTANTES (una columna con
 *  un nombre de estante por fila) — el ACOMODO visual de esos estantes
 *  (qué fila y en qué orden) es independiente, y vive en PropertiesService
 *  como JSON (ver PROP.LAYOUT_ESTANTES en Constantes.gs).
 * ===========================================================================
 */

function obtenerLibro() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

// Envuelve cualquier función expuesta a google.script.run para que SIEMPRE
// regrese un objeto {success, data, error} en vez de dejar que un error
// de Apps Script truene silenciosamente en el cliente.
function ejecutarSeguro_(fn) {
  try {
    const data = fn();
    return { success: true, data: data };
  } catch (err) {
    console.error(err);
    registrarErrorEnHoja_(err);
    return { success: false, error: String(err.message || err) };
  }
}

// Deja un rastro de cada error real (no de las validaciones normales como
// "selecciona un estante") directamente en una hoja del mismo libro, para
// que puedas revisar qué pasó sin tener que abrir el editor de Apps Script.
// Nunca deja que un problema al guardar el log rompa la función original.
function registrarErrorEnHoja_(err) {
  try {
    const ss = obtenerLibro();
    let sheet = ss.getSheetByName('ERRORES');
    if (!sheet) {
      sheet = ss.insertSheet('ERRORES');
      sheet.appendRow(['FECHA', 'ERROR', 'DETALLE TÉCNICO']);
      sheet.getRange('A1:C1').setBackground('#2D3277').setFontColor('#FFE600').setFontWeight('bold');
      sheet.setFrozenRows(1);
      sheet.setColumnWidth(1, 150);
      sheet.setColumnWidth(2, 300);
      sheet.setColumnWidth(3, 500);
    }
    const detalle = err && err.stack ? String(err.stack).slice(0, 500) : '';
    sheet.appendRow([new Date(), String(err && err.message ? err.message : err), detalle]);
  } catch (errAlLoggear) {
    // Si hasta guardar el log falla, no hacemos nada más — no es motivo
    // para que la función original deje de responderle al usuario.
  }
}

// Permite que un archivo .html incluya el contenido de otro, por ejemplo:
//   <?!= include('Compartido'); ?>
// Es el patrón estándar de Apps Script para no repetir código entre páginas.
function include(nombreArchivo) {
  return HtmlService.createHtmlOutputFromFile(nombreArchivo).getContent();
}

function doGet(e) {
  inicializarHojasAuto();
  const page = e ? e.parameter.page || 'Index' : 'Index';
  const props = PropertiesService.getScriptProperties();
  const nombreMarca = props.getProperty(PROP.MARCA_NOMBRE) || MARCA_POR_DEFECTO.nombre;
  return HtmlService.createTemplateFromFile(page)
    .evaluate()
    .setTitle(nombreMarca)
    .setFaviconUrl('https://http2.mlstatic.com/frontend-assets/ml-web-navigation/ui-navigation/6220605/favicon.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function inicializarHojasAuto() {
  const ss = obtenerLibro();

  let sheetPaquetes = ss.getSheetByName(HOJA_PAQUETES);
  if (!sheetPaquetes) {
    sheetPaquetes = ss.insertSheet(HOJA_PAQUETES, 0);
    sheetPaquetes.appendRow(["AGENCIA MERCADO LIBRE - CONTROL DE PAQUETES"]);
    sheetPaquetes.appendRow(["PAQUETES PICK UP EN TIENDA"]);
    sheetPaquetes.appendRow(["UTD", "NOMBRE", "GUIA", "EMBALAJE", "CARACTERÍSTICAS", "ESTATUS", "FECHA ENTRADA", "FECHA SALIDA"]);
    sheetPaquetes.getRange("A3:H3").setBackground("#2D3277").setFontColor("#FFE600").setFontWeight("bold").setHorizontalAlignment("center");
    sheetPaquetes.setFrozenRows(3);
    sheetPaquetes.setColumnWidths(1, 8, 130);
  }

  let sheetConfig = ss.getSheetByName(HOJA_CONFIG);
  if (!sheetConfig) {
    sheetConfig = ss.insertSheet(HOJA_CONFIG);
    sheetConfig.appendRow(["ESTANTE"]);
    sheetConfig.getRange("A1").setBackground("#2D3277").setFontColor("#FFE600").setFontWeight("bold");

    const estantesIniciales = ["A1", "A2", "A3", "B1", "B2", "C1", "C2", "D1", "D2", "D PISO", "CAJA 1", "CAJA 2", "CAJA 2 EN PISO"];
    estantesIniciales.forEach(e => sheetConfig.appendRow([e]));
  }
}

function obtenerVersionApp() {
  return ejecutarSeguro_(() => ({ version: VERSION_APP }));
}