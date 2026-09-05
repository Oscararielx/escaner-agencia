/**
 * ===== Paquetes.gs =====
 * El corazón del sistema: registrar, consultar, buscar, entregar, devolver
 * y eliminar paquetes. Todo lo que lee o escribe la hoja PAQUETES vive aquí.
 */

// ---------- UTD (últimos N dígitos de la guía) ----------
function obtenerDigitosUTD_() {
  const props = PropertiesService.getScriptProperties();
  const val = parseInt(props.getProperty(PROP.UTD_DIGITOS) || String(UTD_DIGITOS_POR_DEFECTO), 10);
  return UTD_DIGITOS_VALIDOS.includes(val) ? val : UTD_DIGITOS_POR_DEFECTO;
}

function obtenerConfigUTD() {
  return ejecutarSeguro_(() => ({ digitos: obtenerDigitosUTD_() }));
}

function guardarConfigUTD(digitos) {
  return ejecutarSeguro_(() => {
    const val = parseInt(digitos, 10);
    if (!UTD_DIGITOS_VALIDOS.includes(val)) throw new Error('El UTD solo puede usar 3, 4 o 5 dígitos.');
    PropertiesService.getScriptProperties().setProperty(PROP.UTD_DIGITOS, String(val));
    return { digitos: val };
  });
}

function formatearUTD(val) {
  const digitos = obtenerDigitosUTD_();
  let str = String(val || '').replace(/\D/g, '').trim();
  if (!str) return '0'.repeat(digitos);
  if (str.length > digitos) str = str.slice(-digitos);
  return str.padStart(digitos, '0');
}

// ---------- Lectura principal (Mostrador, tableros, métricas del día) ----------
function obtenerPaquetesYMetricas() {
  return ejecutarSeguro_(() => {
    inicializarHojasAuto();
    const ss = obtenerLibro();
    const sheet = ss.getSheetByName(HOJA_PAQUETES);

    const ultimaFila = sheet.getLastRow();
    if (ultimaFila < FILA_ENCABEZADO + 1) {
      return { paquetes: [], conteoEstantes: {}, resumenDia: { recibidosHoy: 0, entregadosHoy: 0, devueltosHoy: 0, ultimosEntregados: [] } };
    }

    // Una sola lectura cruda (getValues) en vez de leer el rango dos veces
    // (una para texto formateado y otra para fechas) — se llama cada 4
    // segundos desde el cliente, así que es la función más sensible a velocidad.
    const data = sheet.getRange(FILA_ENCABEZADO + 1, 1, ultimaFila - FILA_ENCABEZADO, 8).getValues();

    const paquetes = [];
    const conteoEstantes = {};
    const hoyStr = new Date().toDateString();

    let recHoy = 0, entHoy = 0, devHoy = 0;
    const ultimosEntregados = [];

    for (let i = 0; i < data.length; i++) {
      const fila = data[i];

      const utd = formatearUTD(fila[0]);
      const nombre = String(fila[1] || '').trim();
      const guia = String(fila[2] || '').trim();
      const ubicacion = String(fila[3] || '').replace(/[()]/g, '').trim();
      const caracteristicas = String(fila[4] || '').trim();
      const estatus = String(fila[5] || '').trim().toUpperCase();
      const fechaEntrada = fila[6] ? new Date(fila[6]) : new Date();
      const fechaSalida = fila[7] ? new Date(fila[7]) : null;
      const numFila = FILA_ENCABEZADO + 1 + i;

      // Los paquetes eliminados (errores de escaneo corregidos) no cuentan
      // en ninguna métrica ni vista activa — quedan en la hoja solo como rastro.
      if (estatus === ESTADOS.ELIMINADO) continue;

      if (fechaEntrada.toDateString() === hoyStr) recHoy++;

      if (estatus === ESTADOS.EN_TIENDA || estatus === "") {
        paquetes.push({
          numFila, utd, nombre, guia, ubicacion, caracteristicas,
          estatus: ESTADOS.EN_TIENDA,
          fechaEntrada: fechaEntrada.toISOString()
        });
        if (ubicacion !== "") conteoEstantes[ubicacion] = (conteoEstantes[ubicacion] || 0) + 1;
      } else if (estatus === ESTADOS.ENTREGADO) {
        if (fechaSalida && fechaSalida.toDateString() === hoyStr) {
          entHoy++;
          ultimosEntregados.push({
            numFila, utd, nombre, ubicacion,
            horaSalida: fechaSalida.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
          });
        }
      } else if (estatus === ESTADOS.DEVUELTO) {
        if (fechaSalida && fechaSalida.toDateString() === hoyStr) devHoy++;
      }
    }

    return {
      paquetes,
      conteoEstantes,
      resumenDia: {
        recibidosHoy: recHoy,
        entregadosHoy: entHoy,
        devueltosHoy: devHoy,
        ultimosEntregados: ultimosEntregados.reverse().slice(0, 8)
      }
    };
  });
}

// Registra UN paquete al instante (se llama en cada escaneo, ya no hay "lote").
// Protección de duplicados:
//  - Misma GUÍA exacta ya en tienda -> no la guarda, regresa duplicadoExacto:true
//    con el estante donde ya estaba, para avisarle al usuario exactamente dónde.
//  - Mismo UTD ya en tienda pero sin nombre -> no lo guarda, regresa requiereNombre:true
//    para que el cliente escriba el nombre en el mismo lugar y así distinguirlos.
// ---------- MEMORIA RÁPIDA DE DUPLICADOS (CacheService) ----------
// Sin esto, cada escaneo tenía que releer TODA la hoja para checar si el UTD
// o la guía ya existían — rápido con pocos paquetes, cada vez más lento
// según crece el inventario. Con esto, la velocidad de escaneo no depende
// de cuántos paquetes ya tengas guardados: igual con 30 que con 3,000.
// Se guarda solo 60 segundos para que, si algo queda inconsistente, se
// autocorrija solo casi de inmediato en vez de arrastrar un error.
const CACHE_KEY_DUPLICADOS = 'duplicados_activos_v1';
const CACHE_DURACION_SEGUNDOS = 60;

function construirListaDuplicadosDesdeHoja_(sheet) {
  const ultimaFila = sheet.getLastRow();
  if (ultimaFila < FILA_ENCABEZADO + 1) return [];
  const rango = sheet.getRange(FILA_ENCABEZADO + 1, 1, ultimaFila - FILA_ENCABEZADO, COL.ESTATUS).getValues();
  const lista = [];
  for (let i = 0; i < rango.length; i++) {
    const estatus = String(rango[i][5] || '').trim().toUpperCase();
    if (estatus !== ESTADOS.EN_TIENDA && estatus !== '') continue;
    lista.push({
      utd: formatearUTD(rango[i][0]),
      guia: String(rango[i][2] || '').trim(),
      ubicacion: String(rango[i][3] || '').replace(/[()]/g, '').trim()
    });
  }
  return lista;
}

function obtenerCacheDuplicados_() {
  try {
    const datos = CacheService.getScriptCache().get(CACHE_KEY_DUPLICADOS);
    return datos ? JSON.parse(datos) : null;
  } catch (e) {
    return null;
  }
}

function guardarCacheDuplicados_(lista) {
  try {
    CacheService.getScriptCache().put(CACHE_KEY_DUPLICADOS, JSON.stringify(lista), CACHE_DURACION_SEGUNDOS);
  } catch (e) {
    // Si el inventario es tan grande que ya no cabe en la caché, simplemente
    // no se guarda — el sistema sigue funcionando, solo sin este atajo.
  }
}

// Se llama cada vez que algo deja de estar "en tienda" o cambia de estante,
// para que la memoria rápida nunca sirva información vieja.
function invalidarCacheDuplicados_() {
  try {
    CacheService.getScriptCache().remove(CACHE_KEY_DUPLICADOS);
  } catch (e) {}
}

function registrarPaqueteInstantaneo(ubicacion, paquete) {
  return ejecutarSeguro_(() => {
    if (!ubicacion || String(ubicacion).trim() === "") throw new Error("Selecciona un estante antes de escanear.");
    if (!paquete || !paquete.guia) throw new Error("Código inválido.");

    const props = PropertiesService.getScriptProperties();
    const demoActivo = props.getProperty(PROP.MODO_DEMO) === '1';
    let demoRegistrados = 0;
    if (demoActivo) {
      demoRegistrados = parseInt(props.getProperty(PROP.DEMO_PAQUETES_REGISTRADOS) || '0', 10);
      if (demoRegistrados >= DEMO_LIMITE_PAQUETES) throw new Error('DEMO_LIMITE_ALCANZADO');
    }

    // Candado: si dos personas escanean justo al mismo instante (muy
    // probable si contratas ayuda en temporada alta), solo una entra aquí a
    // la vez. Sin esto, ambas podrían calcular "me toca la fila 401" al
    // mismo tiempo y una se pisaría a la otra.
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      throw new Error('El sistema está ocupado guardando otro paquete — intenta de nuevo en un segundo.');
    }

    try {
      const ss = obtenerLibro();
      const sheet = ss.getSheetByName(HOJA_PAQUETES);
      const utdOk = formatearUTD(paquete.utd);
      const guiaLimpia = String(paquete.guia).trim();
      const nombreLimpio = String(paquete.nombre || '').trim();

      let listaActivos = obtenerCacheDuplicados_();
      if (!listaActivos) {
        listaActivos = construirListaDuplicadosDesdeHoja_(sheet);
      }

      for (let i = 0; i < listaActivos.length; i++) {
        const activo = listaActivos[i];
        if (activo.guia === guiaLimpia) {
          return { duplicadoExacto: true, guardado: false, requiereNombre: false, utd: activo.utd, ubicacionExistente: activo.ubicacion };
        }
        if (activo.utd === utdOk && nombreLimpio === '') {
          return { requiereNombre: true, guardado: false, utd: utdOk, guia: guiaLimpia };
        }
      }

      const ahora = new Date();
      const ubLimpia = String(ubicacion).trim();
      sheet.getRange(sheet.getLastRow() + 1, 1, 1, 8).setValues([[
        `'${utdOk}`,
        nombreLimpio,
        `'${guiaLimpia}`,
        `( ${ubLimpia} )`,
        String(paquete.caracteristicas || '').trim(),
        ESTADOS.EN_TIENDA,
        ahora,
        ''
      ]]);

      // Se actualiza la memoria rápida sumando el nuevo paquete, en vez de
      // invalidarla — así el siguiente escaneo de la ráfaga sigue sin tener
      // que releer la hoja.
      listaActivos.push({ utd: utdOk, guia: guiaLimpia, ubicacion: ubLimpia });
      guardarCacheDuplicados_(listaActivos);

      if (demoActivo) {
        props.setProperty(PROP.DEMO_PAQUETES_REGISTRADOS, String(demoRegistrados + 1));
      }

      return { requiereNombre: false, guardado: true, utd: utdOk, guia: guiaLimpia, numFila: sheet.getLastRow() };
    } finally {
      lock.releaseLock();
    }
  });
}

// Busca un paquete por UTD o guía en TODO el historial (en tienda, entregado
// o devuelto — los ELIMINADO se excluyen). Pensado para "¿dónde acomodé esto?".
function buscarPaquetePorCodigo(codigo) {
  return ejecutarSeguro_(() => {
    const codigoLimpio = String(codigo || '').trim();
    if (!codigoLimpio) return [];

    const ss = obtenerLibro();
    const sheet = ss.getSheetByName(HOJA_PAQUETES);
    const ultimaFila = sheet.getLastRow();
    if (ultimaFila < FILA_ENCABEZADO + 1) return [];

    const data = sheet.getRange(FILA_ENCABEZADO + 1, 1, ultimaFila - FILA_ENCABEZADO, 8).getValues();

    const soloDigitos = codigoLimpio.replace(/\D/g, '');
    const utdBuscado = formatearUTD(soloDigitos || codigoLimpio);

    const resultados = [];
    for (let i = 0; i < data.length; i++) {
      const fila = data[i];
      const estatus = String(fila[5] || '').trim().toUpperCase();
      if (estatus === ESTADOS.ELIMINADO) continue;

      const utd = formatearUTD(fila[0]);
      const guia = String(fila[2] || '').trim();
      const coincide = (soloDigitos !== '' && (guia === soloDigitos || guia.endsWith(soloDigitos))) || utd === utdBuscado;
      if (!coincide) continue;

      const fechaEntrada = fila[6] ? new Date(fila[6]) : null;
      const fechaSalida = fila[7] ? new Date(fila[7]) : null;

      resultados.push({
        numFila: FILA_ENCABEZADO + 1 + i,
        utd, guia,
        nombre: String(fila[1] || '').trim(),
        ubicacion: String(fila[3] || '').replace(/[()]/g, '').trim(),
        caracteristicas: String(fila[4] || '').trim(),
        estatus: estatus || ESTADOS.EN_TIENDA,
        fechaEntrada: fechaEntrada ? fechaEntrada.toISOString() : null,
        fechaSalida: fechaSalida ? fechaSalida.toISOString() : null
      });
    }

    resultados.sort((a, b) => new Date(b.fechaEntrada || 0) - new Date(a.fechaEntrada || 0));
    return resultados.slice(0, 15);
  });
}

function marcarEntregados(filas) {
  return ejecutarSeguro_(() => {
    if (!Array.isArray(filas) || filas.length === 0) throw new Error("No se especificaron paquetes.");
    const ss = obtenerLibro();
    const sheet = ss.getSheetByName(HOJA_PAQUETES);
    const ahora = new Date();
    filas.forEach(numFila => {
      sheet.getRange(numFila, COL.ESTATUS).setValue(ESTADOS.ENTREGADO);
      sheet.getRange(numFila, COL.FECHA_SALIDA).setValue(ahora);
    });
    invalidarCacheDuplicados_();
    return { count: filas.length };
  });
}

function marcarDevueltos(filas) {
  return ejecutarSeguro_(() => {
    if (!Array.isArray(filas) || filas.length === 0) throw new Error("No se especificaron paquetes.");
    const ss = obtenerLibro();
    const sheet = ss.getSheetByName(HOJA_PAQUETES);
    const ahora = new Date();
    filas.forEach(numFila => {
      sheet.getRange(numFila, COL.ESTATUS).setValue(ESTADOS.DEVUELTO);
      sheet.getRange(numFila, COL.FECHA_SALIDA).setValue(ahora);
    });
    invalidarCacheDuplicados_();
    return { count: filas.length };
  });
}

// Elimina de verdad un paquete mal escaneado (no lo confunde con "entregado"
// ni "devuelto"). La fila se queda en la hoja marcada como ELIMINADO —
// obtenerPaquetesYMetricas la ignora por completo — para dejar rastro por si
// algún día hace falta revisar qué se borró y cuándo.
function eliminarPaquete(numFila) {
  return ejecutarSeguro_(() => {
    const ss = obtenerLibro();
    const sheet = ss.getSheetByName(HOJA_PAQUETES);
    const ahora = new Date();
    sheet.getRange(numFila, COL.ESTATUS).setValue(ESTADOS.ELIMINADO);
    sheet.getRange(numFila, COL.FECHA_SALIDA).setValue(ahora);
    descontarDemoSiAplica_(1);
    invalidarCacheDuplicados_();
    return true;
  });
}

function eliminarPaquetes(filas) {
  return ejecutarSeguro_(() => {
    if (!Array.isArray(filas) || filas.length === 0) throw new Error("No se especificaron paquetes.");
    const ss = obtenerLibro();
    const sheet = ss.getSheetByName(HOJA_PAQUETES);
    const ahora = new Date();
    filas.forEach(numFila => {
      sheet.getRange(numFila, COL.ESTATUS).setValue(ESTADOS.ELIMINADO);
      sheet.getRange(numFila, COL.FECHA_SALIDA).setValue(ahora);
    });
    descontarDemoSiAplica_(filas.length);
    invalidarCacheDuplicados_();
    return { count: filas.length };
  });
}

function deshacerEntrega(numFila) {
  return ejecutarSeguro_(() => {
    const ss = obtenerLibro();
    const sheet = ss.getSheetByName(HOJA_PAQUETES);
    sheet.getRange(numFila, COL.ESTATUS).setValue(ESTADOS.EN_TIENDA);
    sheet.getRange(numFila, COL.FECHA_SALIDA).setValue("");
    invalidarCacheDuplicados_();
    return true;
  });
}

function editarPaqueteCompleto(numFila, nuevoNombre, nuevaUbicacion, nuevasCaracteristicas) {
  return ejecutarSeguro_(() => {
    const ss = obtenerLibro();
    const sheet = ss.getSheetByName(HOJA_PAQUETES);

    // OJO: google.script.run convierte los argumentos "undefined" del cliente
    // en "null" al llegar aquí — por eso se valida contra AMBOS, si no, se
    // guardaba literalmente la palabra "null" en la celda.
    if (nuevoNombre !== undefined && nuevoNombre !== null) sheet.getRange(numFila, COL.NOMBRE).setValue(String(nuevoNombre).trim());
    if (nuevaUbicacion !== undefined && nuevaUbicacion !== null && String(nuevaUbicacion).trim() !== "") {
      sheet.getRange(numFila, COL.EMBALAJE).setValue(`( ${String(nuevaUbicacion).trim()} )`);
    }
    if (nuevasCaracteristicas !== undefined && nuevasCaracteristicas !== null) sheet.getRange(numFila, COL.CARACTERISTICAS).setValue(String(nuevasCaracteristicas).trim());

    invalidarCacheDuplicados_();
    return true;
  });
}

function vaciarTodosLosPaquetes() {
  return ejecutarSeguro_(() => {
    const ss = obtenerLibro();
    const sheet = ss.getSheetByName(HOJA_PAQUETES);
    if (sheet) {
      sheet.clear();
      sheet.appendRow(["AGENCIA MERCADO LIBRE - CONTROL DE PAQUETES"]);
      sheet.appendRow(["PAQUETES PICK UP EN TIENDA"]);
      sheet.appendRow(["UTD", "NOMBRE", "GUIA", "EMBALAJE", "CARACTERÍSTICAS", "ESTATUS", "FECHA ENTRADA", "FECHA SALIDA"]);
      sheet.getRange("A3:H3").setBackground("#2D3277").setFontColor("#FFE600").setFontWeight("bold").setHorizontalAlignment("center");
      sheet.setFrozenRows(3);
    }
    invalidarCacheDuplicados_();
    return true;
  });
}

function obtenerRachaDelDia() {
  return ejecutarSeguro_(() => {
    const ss = obtenerLibro();
    const sheet = ss.getSheetByName(HOJA_PAQUETES);
    const ultimaFila = sheet.getLastRow();
    const nombresDias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const hoy = new Date();
    const hoyStr = hoy.toDateString();
    const diaSemana = hoy.getDay();

    if (ultimaFila < FILA_ENCABEZADO + 1) {
      return { recibidosHoy: 0, promedio: 0, diffPercent: null, diaSemanaTexto: nombresDias[diaSemana], muestras: 0 };
    }

    // Lee ESTATUS junto con la fecha — un paquete ELIMINADO (error de escaneo
    // corregido) nunca debió contar como "recibido hoy", pero antes solo se
    // miraba la fecha sin importar el estatus.
    const datos = sheet.getRange(FILA_ENCABEZADO + 1, COL.ESTATUS, ultimaFila - FILA_ENCABEZADO, 2).getValues();

    const conteoPorFecha = {};
    let recibidosHoy = 0;

    datos.forEach(row => {
      const estatus = String(row[0] || '').trim().toUpperCase();
      if (estatus === ESTADOS.ELIMINADO) return;

      const fecha = row[1] ? new Date(row[1]) : null;
      if (!fecha || isNaN(fecha.getTime())) return;
      const key = fecha.toDateString();
      if (key === hoyStr) { recibidosHoy++; return; }
      if (fecha.getDay() === diaSemana) {
        conteoPorFecha[key] = (conteoPorFecha[key] || 0) + 1;
      }
    });

    const fechasPasadas = Object.keys(conteoPorFecha);
    const totalPasado = fechasPasadas.reduce((sum, k) => sum + conteoPorFecha[k], 0);
    const promedio = fechasPasadas.length > 0 ? totalPasado / fechasPasadas.length : 0;
    const diffPercent = promedio > 0 ? Math.round(((recibidosHoy - promedio) / promedio) * 100) : null;

    return {
      recibidosHoy,
      promedio: Math.round(promedio * 10) / 10,
      diffPercent,
      diaSemanaTexto: nombresDias[diaSemana],
      muestras: fechasPasadas.length
    };
  });
}

function obtenerCSVExportacion() {
  return ejecutarSeguro_(() => {
    const ss = obtenerLibro();
    const sheet = ss.getSheetByName(HOJA_PAQUETES);
    const ultimaFila = sheet.getLastRow();
    if (ultimaFila < FILA_ENCABEZADO + 1) return "UTD,NOMBRE,GUIA,ESTANTE,CARACTERISTICAS,ESTATUS,FECHA_ENTRADA,FECHA_SALIDA\n";

    const data = sheet.getRange(FILA_ENCABEZADO + 1, 1, ultimaFila - FILA_ENCABEZADO, 8).getDisplayValues();
    let csvContent = "UTD,NOMBRE,GUIA,ESTANTE,CARACTERISTICAS,ESTATUS,FECHA_ENTRADA,FECHA_SALIDA\n";

    data.forEach(row => {
      const utd = `"${formatearUTD(row[0])}"`;
      const nom = `"${String(row[1] || '').replace(/"/g, '""')}"`;
      const guia = `"${String(row[2] || '').replace(/"/g, '""')}"`;
      const ubi = `"${String(row[3] || '').replace(/[()]/g, '').trim()}"`;
      const car = `"${String(row[4] || '').replace(/"/g, '""')}"`;
      const est = `"${String(row[5] || '').replace(/"/g, '""')}"`;
      const fecE = `"${row[6] || ''}"`;
      const fecS = `"${row[7] || ''}"`;
      csvContent += `${utd},${nom},${guia},${ubi},${car},${est},${fecE},${fecS}\n`;
    });

    return csvContent;
  });
}