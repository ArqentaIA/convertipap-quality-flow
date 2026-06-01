// Datos semilla para el prototipo Fase 5.
// Las 4 máquinas (MP-04..MP-07) están repartidas entre dos laboratorios:
//   Laboratorio Sur:   MP-04, MP-05
//   Laboratorio Norte: MP-06, MP-07
// Ver src/lib/lab.ts para la lógica de filtrado por laboratorio.

import type {
  MockOrden,
  MockMaquinaEstadoActual,
  MockEspecificacionCongelada,
} from "./types";

const specPapelHigienicoV3: MockEspecificacionCongelada = {
  especificacion_id: "spec-phr01-v3",
  version: "v3.0",
  estrategia_muestreo: "por_tiempo",
  frecuencia_muestreo: 30,
  variables: [
    { variable_id: "v-gramaje", clave: "gramaje", etiqueta: "Gramaje", unidad: "g/m²", min_valor: 38, objetivo: 40, max_valor: 42, paso: 0.1 },
    { variable_id: "v-humedad", clave: "humedad", etiqueta: "Humedad", unidad: "%", min_valor: 5, objetivo: 6.5, max_valor: 8, paso: 0.1 },
    { variable_id: "v-resistencia", clave: "resistencia", etiqueta: "Resistencia", unidad: "N", min_valor: 120, objetivo: 150, max_valor: 180, paso: 1 },
    { variable_id: "v-caliper", clave: "caliper", etiqueta: "Caliper", unidad: "µm", min_valor: 90, objetivo: 100, max_valor: 110, paso: 1 },
  ],
};

const specToallaV1: MockEspecificacionCongelada = {
  especificacion_id: "spec-toalla-v1",
  version: "v1.2",
  estrategia_muestreo: "por_rollo",
  frecuencia_muestreo: 5,
  variables: [
    { variable_id: "v-gramaje-t", clave: "gramaje", etiqueta: "Gramaje", unidad: "g/m²", min_valor: 22, objetivo: 24, max_valor: 26, paso: 0.1 },
    { variable_id: "v-humedad-t", clave: "humedad", etiqueta: "Humedad", unidad: "%", min_valor: 4, objetivo: 5.5, max_valor: 7, paso: 0.1 },
    { variable_id: "v-blancura-t", clave: "blancura", etiqueta: "Blancura", unidad: "ISO", min_valor: 80, objetivo: 85, max_valor: 90, paso: 0.5 },
  ],
};

export const MOCK_ORDENES: MockOrden[] = [
  // --- Laboratorio SUR ---
  {
    orden_id: "ord-mp04-001",
    folio: "OF-2026-0142",
    estado: "en_proceso",
    producto_id: "p-phr01",
    producto_nombre: "Papel Higiénico Premium 2H",
    producto_codigo: "PHR01",
    maquina_id: "maq-mp04",
    maquina_nombre: "MP-04",
    planta_id: "planta-tlx",
    planta_nombre: "Tlaxcala",
    turno: "A",
    operario_id: "op-1",
    operario_nombre: "Juan Pérez (Jefe Máquina)",
    especificacion_congelada: specPapelHigienicoV3,
    ultimo_rollo: 12,
  },
  {
    orden_id: "ord-mp05-001",
    folio: "OF-2026-0143",
    estado: "en_proceso",
    producto_id: "p-toalla",
    producto_nombre: "Toalla Interdoblada Eco",
    producto_codigo: "TIE02",
    maquina_id: "maq-mp05",
    maquina_nombre: "MP-05",
    planta_id: "planta-tlx",
    planta_nombre: "Tlaxcala",
    turno: "A",
    operario_id: "op-2",
    operario_nombre: "Ana López (Operador)",
    especificacion_congelada: specToallaV1,
    ultimo_rollo: 7,
  },
  // --- Laboratorio NORTE ---
  {
    orden_id: "ord-mp06-001",
    folio: "OF-2026-0144",
    estado: "en_proceso",
    producto_id: "p-toalla",
    producto_nombre: "Toalla Interdoblada Eco",
    producto_codigo: "TIE02",
    maquina_id: "maq-mp06",
    maquina_nombre: "MP-06",
    planta_id: "planta-tlx",
    planta_nombre: "Tlaxcala",
    turno: "A",
    operario_id: "op-3",
    operario_nombre: "Erick Ordoñez (Jefe Máquina)",
    especificacion_congelada: specToallaV1,
    ultimo_rollo: 9,
  },
  {
    orden_id: "ord-mp07-001",
    folio: "OF-2026-0140",
    estado: "pausada",
    producto_id: "p-phr01",
    producto_nombre: "Papel Higiénico Premium 2H",
    producto_codigo: "PHR01",
    maquina_id: "maq-mp07",
    maquina_nombre: "MP-07",
    planta_id: "planta-tlx",
    planta_nombre: "Tlaxcala",
    turno: "B",
    operario_id: null,
    operario_nombre: null,
    especificacion_congelada: specPapelHigienicoV3,
    ultimo_rollo: 4,
  },
  {
    orden_id: "ord-mp05-prev",
    folio: "OF-2026-0138",
    estado: "cerrada",
    producto_id: "p-toalla",
    producto_nombre: "Toalla Interdoblada Eco",
    producto_codigo: "TIE02",
    maquina_id: "maq-mp05",
    maquina_nombre: "MP-05",
    planta_id: "planta-tlx",
    planta_nombre: "Tlaxcala",
    turno: "C",
    operario_id: "op-3",
    operario_nombre: "Luis Hernández",
    especificacion_congelada: specToallaV1,
    ultimo_rollo: 30,
  },
];

// maquina_estado_actual — qué orden corre físicamente en cada máquina ahora
export const MOCK_MAQUINA_ESTADO: MockMaquinaEstadoActual[] = [
  { maquina_id: "maq-mp04", orden_activa_id: "ord-mp04-001" },
  { maquina_id: "maq-mp05", orden_activa_id: "ord-mp05-001" },
  { maquina_id: "maq-mp06", orden_activa_id: "ord-mp06-001" },
  { maquina_id: "maq-mp07", orden_activa_id: null }, // pausada — prueba bloqueo
];
