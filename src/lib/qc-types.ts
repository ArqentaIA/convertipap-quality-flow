// Tipos compartidos del dominio QC. Espejo de las tablas reales en Supabase
// (muestras_calidad / mediciones_calidad / ajustes_calidad). Sustituye al
// antiguo src/lib/qc-mock/types.ts ahora que la capa de datos es real.

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

export type ResultadoAjuste = "pendiente" | "exitoso" | "parcial" | "fallido";

export interface MuestraCalidad {
  id: string;
  orden_id: string;
  producto_id: string;
  maquina_id: string;
  planta_id: string;
  turno: string;
  operario_id: string | null;
  especificacion_id: string;
  especificacion_version: string;
  numero_rollo: string | null;
  jefe_maquina: string | null;
  operador: string | null;
  prensero: string | null;
  analista: string | null;
  hora_muestreo: string;
  tipo_muestreo: EstrategiaMuestreo;
  observaciones_generales: string;
  estado: MuestraEstado;
  capturado_por: string;
  capturado_at: string;
  revisado_por: string | null;
  revisado_at: string | null;
  dictamen: DictamenCalidad | null;
  dictamen_motivo: string | null;
  autorizado_por?: string | null;
  rol_autorizador?: string | null;
  autorizado_at?: string | null;
  dictamen_at?: string | null;
  dictamen_observaciones?: string | null;
  evidencia_url?: string | null;
  mediciones_modificadas_at?: string | null;
  mediciones_modificadas_por?: string | null;
  mediciones_modificacion_motivo?: string | null;
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
  detectado_en: string;
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
  muestra_verificacion_id: string | null;
  sla_objetivo_horas: number;
  estado_flujo:
    | "solicitado"
    | "autorizado"
    | "en_ejecucion"
    | "cerrado"
    | "rechazado";
  created_at: string;
  updated_at: string;
}
