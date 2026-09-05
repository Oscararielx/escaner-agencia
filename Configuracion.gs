/**
 * ===== Configuracion.gs =====
 * Todo lo que se administra desde la pantalla de Ajustes y que aplica a
 * nivel negocio (una sola vez, para todos los dispositivos): nombre y
 * colores de la marca, modo demo para prospectos, y la URL del escáner
 * de cámara externo.
 */

function obtenerConfigMarca() {
  return ejecutarSeguro_(() => {
    const props = PropertiesService.getScriptProperties();
    return {
      nombre: props.getProperty(PROP.MARCA_NOMBRE) || MARCA_POR_DEFECTO.nombre,
      colorAcento: props.getProperty(PROP.MARCA_COLOR_ACENTO) || MARCA_POR_DEFECTO.colorAcento,
      colorNavy: props.getProperty(PROP.MARCA_COLOR_NAVY) || MARCA_POR_DEFECTO.colorNavy
    };
  });
}

function guardarConfigMarca(nombre, colorAcento, colorNavy) {
  return ejecutarSeguro_(() => {
    const props = PropertiesService.getScriptProperties();
    const nombreLimpio = String(nombre || '').trim() || MARCA_POR_DEFECTO.nombre;
    const hexValido = /^#[0-9A-Fa-f]{6}$/;
    const acentoLimpio = hexValido.test(colorAcento) ? colorAcento : MARCA_POR_DEFECTO.colorAcento;
    const navyLimpio = hexValido.test(colorNavy) ? colorNavy : MARCA_POR_DEFECTO.colorNavy;

    props.setProperty(PROP.MARCA_NOMBRE, nombreLimpio);
    props.setProperty(PROP.MARCA_COLOR_ACENTO, acentoLimpio);
    props.setProperty(PROP.MARCA_COLOR_NAVY, navyLimpio);

    return { nombre: nombreLimpio, colorAcento: acentoLimpio, colorNavy: navyLimpio };
  });
}

// ---------- MODO DEMO ----------
// Limita cuántos paquetes se pueden registrar en total en esta copia. Pensado
// para dejarle probar la app a un prospecto antes de venderle su propia copia.
function obtenerConfigDemo() {
  return ejecutarSeguro_(() => {
    const props = PropertiesService.getScriptProperties();
    return {
      activo: props.getProperty(PROP.MODO_DEMO) === '1',
      limite: DEMO_LIMITE_PAQUETES,
      registrados: parseInt(props.getProperty(PROP.DEMO_PAQUETES_REGISTRADOS) || '0', 10),
      contacto: props.getProperty(PROP.DEMO_CONTACTO) || '',
      pinConfigurado: !!(props.getProperty(PROP.DEMO_PIN_AJUSTES) || '')
    };
  });
}

function guardarConfigDemo(activo, contacto, pin) {
  return ejecutarSeguro_(() => {
    const props = PropertiesService.getScriptProperties();
    props.setProperty(PROP.MODO_DEMO, activo ? '1' : '0');
    props.setProperty(PROP.DEMO_CONTACTO, String(contacto || '').trim());
    if (pin !== undefined && pin !== null && String(pin).trim() !== '') {
      props.setProperty(PROP.DEMO_PIN_AJUSTES, String(pin).trim());
    }
    if (activo && props.getProperty(PROP.DEMO_PAQUETES_REGISTRADOS) === null) {
      props.setProperty(PROP.DEMO_PAQUETES_REGISTRADOS, '0');
    }
    return { activo: !!activo };
  });
}

function validarPinAjustes(pinIngresado) {
  return ejecutarSeguro_(() => {
    const props = PropertiesService.getScriptProperties();
    const demoActivo = props.getProperty(PROP.MODO_DEMO) === '1';
    const pinGuardado = props.getProperty(PROP.DEMO_PIN_AJUSTES) || '';
    // Si el modo demo no está activo, o no hay PIN configurado, Ajustes queda abierto sin fricción.
    if (!demoActivo || !pinGuardado) return { valido: true, requerido: false };
    return { valido: String(pinIngresado || '').trim() === pinGuardado, requerido: true };
  });
}

function reiniciarContadorDemo() {
  return ejecutarSeguro_(() => {
    PropertiesService.getScriptProperties().setProperty(PROP.DEMO_PAQUETES_REGISTRADOS, '0');
    return true;
  });
}

// Se llama cada vez que se elimina un paquete, para que "deshacer un error de
// escaneo" no cuente contra el límite de paquetes de la demo.
function descontarDemoSiAplica_(cantidad) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(PROP.MODO_DEMO) !== '1') return;
  const actual = parseInt(props.getProperty(PROP.DEMO_PAQUETES_REGISTRADOS) || '0', 10);
  props.setProperty(PROP.DEMO_PAQUETES_REGISTRADOS, String(Math.max(0, actual - cantidad)));
}

// ---------- ESCÁNER DE CÁMARA ----------
// Apps Script bloquea el acceso a la cámara por seguridad, así que el
// escaneo con cámara vive en una páginita externa (GitHub Pages) cuya URL
// se configura aquí una sola vez para todo el negocio.
function obtenerConfigCamara() {
  return ejecutarSeguro_(() => {
    const props = PropertiesService.getScriptProperties();
    return { url: props.getProperty(PROP.URL_ESCANER_CAMARA) || '' };
  });
}

function guardarConfigCamara(url) {
  return ejecutarSeguro_(() => {
    const props = PropertiesService.getScriptProperties();
    const limpio = String(url || '').trim();
    if (limpio && !/^https:\/\//i.test(limpio)) {
      throw new Error('La URL debe empezar con https://');
    }
    props.setProperty(PROP.URL_ESCANER_CAMARA, limpio);
    return { url: limpio };
  });
}