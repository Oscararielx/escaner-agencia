/**
 * ===== Constantes.gs =====
 * Todo lo que antes eran "textos mágicos" repetidos a mano en cada función
 * (el nombre de la hoja, la palabra "ENTREGADO", cuántos días se retienen los
 * registros cerrados, etc.) vive aquí una sola vez. Si algún día cambia algo
 * de esto, se cambia en un solo lugar y toda la app lo respeta.
 */

const VERSION_APP = '3.0.0';

// ---------- Estructura de la hoja de cálculo ----------
const HOJA_PAQUETES = "PAQUETES";
const HOJA_CONFIG = "CONFIG_ESTANTES";
const FILA_ENCABEZADO = 3; // primera fila de datos reales (después de los 2 encabezados decorativos + fila de títulos)

// Columnas de la hoja PAQUETES, en el mismo orden en que existen ahí (1 = A, 2 = B, ...)
const COL = {
  UTD: 1,
  NOMBRE: 2,
  GUIA: 3,
  EMBALAJE: 4,
  CARACTERISTICAS: 5,
  ESTATUS: 6,
  FECHA_ENTRADA: 7,
  FECHA_SALIDA: 8
};

// Únicos 4 valores que puede tener la columna ESTATUS. EN_TIENDA es el
// estado "activo"; los otros tres son estados "cerrados" (ver Limpieza.gs).
const ESTADOS = {
  EN_TIENDA: 'EN TIENDA',
  ENTREGADO: 'ENTREGADO',
  DEVUELTO: 'DEVUELTO A CHOFER ML',
  ELIMINADO: 'ELIMINADO'
};

// ---------- PropertiesService: claves usadas para configuración a nivel negocio ----------
// (todas viven en PropertiesService.getScriptProperties(), no por dispositivo)
const PROP = {
  LAYOUT_ESTANTES: 'ESTANTES_LAYOUT',
  MARCA_NOMBRE: 'MARCA_NOMBRE',
  MARCA_COLOR_ACENTO: 'MARCA_COLOR_ACENTO',
  MARCA_COLOR_NAVY: 'MARCA_COLOR_NAVY',
  MODO_DEMO: 'MODO_DEMO',
  DEMO_CONTACTO: 'DEMO_CONTACTO',
  DEMO_PIN_AJUSTES: 'DEMO_PIN_AJUSTES',
  DEMO_PAQUETES_REGISTRADOS: 'DEMO_PAQUETES_REGISTRADOS',
  URL_ESCANER_CAMARA: 'URL_ESCANER_CAMARA',
  UTD_DIGITOS: 'UTD_DIGITOS',
  CAPACIDADES_ESTANTES: 'CAPACIDADES_ESTANTES'
};

const CAPACIDAD_ESTANTE_DEFECTO = 10;

const MARCA_POR_DEFECTO = {
  nombre: 'Mi Agencia Mercado Libre',
  colorAcento: '#FFE600',
  colorNavy: '#2D3277'
};

// ---------- Modo demo ----------
const DEMO_LIMITE_PAQUETES = 10;

// ---------- UTD ----------
const UTD_DIGITOS_VALIDOS = [3, 4, 5];
const UTD_DIGITOS_POR_DEFECTO = 3;

// ---------- Limpieza automática ----------
const DIAS_RETENCION_CERRADOS = 30;
const ESTATUS_CERRADOS = [ESTADOS.ENTREGADO, ESTADOS.DEVUELTO, ESTADOS.ELIMINADO];
const NOMBRE_TRIGGER_LIMPIEZA = 'limpiarRegistrosAntiguos';