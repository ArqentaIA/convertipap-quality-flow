// Tipos del prototipo Fase 5 — Control de Calidad
// El shape replica exactamente las futuras tablas de Supabase para que
// la migración posterior sea transparente.

export type MuestraEstado =
  | "borrador"
  | "pendiente_revision"
  | "en_ajuste"
  | "reproceso"
  | "liberada"
  | "rechazada"
  | "concesion";

export type MedicionEstado =
  | "pendiente"
  | "conforme"
  | "no_conforme"
  | "fuera_rango_critico";

export type EstrategiaMuestreo = "por_rollo" | "por_tiempo";

export type DictamenCalidad = "liberada" | "rechazada" | "concesion";

export type TipoAjuste =
  | "ajuste_calidad"
  | "ajuste_maquina"
  | "ajuste_parametros"
  | "cambio_materia_prima"
  | "reproceso"
  | "otro";

export type ResultadoAjuste =
  | "pendiente"
  | "exitoso"
  | "parcial"
  | "fallido";

// --- Catálogos mock (referenciados por las muestras) -----------------------

export interface MockVariableSpec {
  variable_id: string;
  clave: string;          // "gramaje", "humedad", ...
  etiqueta: string;       // "Gramaje"
  unidad: string;         // "g/m²"
  min_valor: number;
  objetivo: number;
  max_valor: number;
  paso?: number;          // step del input
}

export interface MockEspecificacionCongelada {
  especificacion_id: string;
  version: string;
  variables: MockVariableSpec[];
  estrategia_muestreo: EstrategiaMuestreo;
  frecuencia_muestreo: number; // rollos o minutos
}

export interface MockOrden {
  orden_id: string;
  folio: string;
  estado: "borrador" | "en_proceso" | "pausada" | "cerrada" | "cancelada";
  producto_id: string;
  producto_nombre: string;
  producto_codigo: string;
  maquina_id: string;
  maquina_nombre: string;
  planta_id: string;
  planta_nombre: string;
  turno: "A" | "B" | "C";
  operario_id: string | null;
  operario_nombre: string | null;
  // Spec congelada al iniciar la orden
  especificacion_congelada: MockEspecificacionCongelada;
  // Producción actual
  ultimo_rollo: number;
}

export interface MockMaquinaEstadoActual {
  maquina_id: string;
  orden_activa_id: string | null;
}

// --- Tablas de calidad (espejo de las futuras tablas reales) --------------

export interface MuestraCalidad {
  id: string;
  orden_id: string;
  // snapshots de contexto (congelados al crear muestra)
  producto_id: string;
  maquina_id: string;
  planta_id: string;
  turno: string;
  operario_id: string | null;
  especificacion_id: string;
  especificacion_version: string;
  // datos de la muestra
  numero_rollo: number | null;
  hora_muestreo: string; // ISO
  tipo_muestreo: EstrategiaMuestreo;
  observaciones_generales: string;
  // workflow
  estado: MuestraEstado;
  capturado_por: string;
  capturado_at: string;
  revisado_por: string | null;
  revisado_at: string | null;
  dictamen: DictamenCalidad | null;
  dictamen_motivo: string | null;
  // snapshot redundante para trazabilidad
  variables_snapshot_json: Record<
    string,
    { min: number; obj: number; max: number; unidad: string; etiqueta: string }
  >;
  created_at: string;
  updated_at: string;
}

export interface MedicionCalidad {
  id: string;
  muestra_id: string;
  variable_id: string;
  variable_clave: string;
  valor: number;
  min_snapshot: number;
  objetivo_snapshot: number;
  max_snapshot: number;
  estado: MedicionEstado;
  observacion: string;
  created_at: string;
}

export interface AjusteCalidad {
  id: string;
  muestra_id: string | null;
  orden_id: string;
  maquina_id: string;
  planta_id: string;
  tipo_ajuste: TipoAjuste;
  motivo: string;
  detectado_en: string; // ISO
  solicitado_por: string;
  solicitado_at: string;
  autorizado_por: string | null;
  autorizado_at: string | null;
  ajustado_por: string | null;
  ajustado_at: string | null;
  accion_realizada: string | null;
  resultado: ResultadoAjuste;
  evidencia_url: string | null;
  observacion_ajuste: string | null;
  created_at: string;
  updated_at: string;
}

// --- Forma agregada usada por la UI de captura ----------------------------

export interface CapturaDraft {
  orden_id: string;
  numero_rollo: number | null;
  hora_muestreo: string;
  observaciones_generales: string;
  mediciones: Record<
    string, // variable_id
    { valor: string; observacion: string }
  >;
}
