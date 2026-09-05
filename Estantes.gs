/**
 * ===== Estantes.gs =====
 * La LISTA de estantes que existen (hoja CONFIG_ESTANTES) es independiente
 * de su ACOMODO visual en el tablero (qué fila y en qué orden — eso vive en
 * PropertiesService como JSON). Separarlos así permite que agregar/quitar un
 * estante en Ajustes nunca choque con el orden que armaste arrastrando en
 * la pantalla de Acomodar.
 */

function obtenerEstantesInterno_() {
  const ss = obtenerLibro();
  const sheet = ss.getSheetByName(HOJA_CONFIG);
  const data = sheet.getDataRange().getValues();
  data.shift();
  return data.map(r => String(r[0]).trim()).filter(r => r !== "");
}

function obtenerEstantes() {
  return ejecutarSeguro_(() => {
    inicializarHojasAuto();
    return obtenerEstantesInterno_();
  });
}

// El layout se guarda como un arreglo de filas, cada fila es un arreglo de
// nombres de estante, ej: [["A1","A2","A3"],["B1","B2"],["CAJA 1"]].
function obtenerEstantesConLayout() {
  return ejecutarSeguro_(() => {
    inicializarHojasAuto();
    const listaEstantes = obtenerEstantesInterno_();
    const props = PropertiesService.getScriptProperties();

    let layout = [];
    try { layout = JSON.parse(props.getProperty(PROP.LAYOUT_ESTANTES) || '[]'); } catch (e) { layout = []; }
    if (!Array.isArray(layout)) layout = [];

    // Descarta estantes que ya no existen y detecta cuáles faltan por acomodar
    const setValidos = new Set(listaEstantes);
    const colocados = new Set();
    layout = layout
      .map(fila => Array.isArray(fila) ? fila.filter(n => setValidos.has(n)) : [])
      .filter(fila => fila.length > 0);
    layout.forEach(fila => fila.forEach(n => colocados.add(n)));

    const sinAcomodar = listaEstantes.filter(n => !colocados.has(n));
    if (sinAcomodar.length > 0) layout.push(sinAcomodar);

    let capacidades = {};
    try { capacidades = JSON.parse(props.getProperty(PROP.CAPACIDADES_ESTANTES) || '{}'); } catch (e) { capacidades = {}; }

    return { layout: layout, estantes: listaEstantes, capacidades: capacidades };
  });
}

// Cuánto aguanta cada estante es distinto en la vida real (una CAJA no es lo
// mismo que un estante grande) — esto deja que tú lo definas por estante en
// vez de usar el mismo número fijo para todos. El que no se configure usa
// CAPACIDAD_ESTANTE_DEFECTO.
function guardarCapacidadEstante(nombreEstante, capacidad) {
  return ejecutarSeguro_(() => {
    const nombre = String(nombreEstante || '').trim();
    if (!nombre) throw new Error("Falta el nombre del estante.");
    const cap = parseInt(capacidad, 10);
    if (!cap || cap < 1) throw new Error("La capacidad debe ser un número mayor a 0.");

    const props = PropertiesService.getScriptProperties();
    let capacidades = {};
    try { capacidades = JSON.parse(props.getProperty(PROP.CAPACIDADES_ESTANTES) || '{}'); } catch (e) { capacidades = {}; }
    capacidades[nombre] = cap;
    props.setProperty(PROP.CAPACIDADES_ESTANTES, JSON.stringify(capacidades));
    return { ok: true };
  });
}

function guardarLayoutEstantes(layout) {
  return ejecutarSeguro_(() => {
    if (!Array.isArray(layout)) throw new Error("Layout inválido.");
    const setValidos = new Set(obtenerEstantesInterno_());
    const limpio = layout
      .map(fila => Array.isArray(fila) ? fila.map(n => String(n).trim()).filter(n => setValidos.has(n)) : [])
      .filter(fila => fila.length > 0);
    PropertiesService.getScriptProperties().setProperty(PROP.LAYOUT_ESTANTES, JSON.stringify(limpio));
    return { ok: true };
  });
}

function guardarEstantes(listaEstantes) {
  return ejecutarSeguro_(() => {
    if (!Array.isArray(listaEstantes)) throw new Error("Lista de estantes inválida.");

    // Normaliza y elimina duplicados (sin distinguir mayúsculas/minúsculas)
    const vistos = new Set();
    const limpios = [];
    listaEstantes.forEach(e => {
      const val = String(e || '').trim().toUpperCase();
      if (val !== "" && !vistos.has(val)) {
        vistos.add(val);
        limpios.push(val);
      }
    });

    const ss = obtenerLibro();
    let sheet = ss.getSheetByName(HOJA_CONFIG) || ss.insertSheet(HOJA_CONFIG);
    sheet.clear();
    sheet.appendRow(["ESTANTE"]);
    sheet.getRange("A1").setBackground("#2D3277").setFontColor("#FFE600").setFontWeight("bold");
    if (limpios.length > 0) {
      sheet.getRange(2, 1, limpios.length, 1).setValues(limpios.map(e => [e]));
    }
    return { total: limpios.length };
  });
}