// Store mock para Fase 5 — persistencia en localStorage.
// Espejo exacto de las futuras tablas: muestras_calidad, mediciones_calidad,
// ajustes_calidad, más catálogos auxiliares (órdenes, estado de máquina).

import { useSyncExternalStore } from "react";
import type {
  MuestraCalidad,
  MedicionCalidad,
  AjusteCalidad,
  MockOrden,
  MockMaquinaEstadoActual,
  MedicionEstado,
} from "./types";
import { MOCK_ORDENES, MOCK_MAQUINA_ESTADO } from "./seed";

const STORAGE_KEY = "qc-mock-store-v1";

interface QcMockState {
  ordenes: MockOrden[];
  maquinas_estado: MockMaquinaEstadoActual[];
  muestras: MuestraCalidad[];
  mediciones: MedicionCalidad[];
  ajustes: AjusteCalidad[];
}

const initialState: QcMockState = {
  ordenes: MOCK_ORDENES,
  maquinas_estado: MOCK_MAQUINA_ESTADO,
  muestras: [],
  mediciones: [],
  ajustes: [],
};

function load(): QcMockState {
  if (typeof window === "undefined") return initialState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as Partial<QcMockState>;
    return {
      ordenes: parsed.ordenes ?? initialState.ordenes,
      maquinas_estado: parsed.maquinas_estado ?? initialState.maquinas_estado,
      muestras: parsed.muestras ?? [],
      mediciones: parsed.mediciones ?? [],
      ajustes: parsed.ajustes ?? [],
    };
  } catch {
    return initialState;
  }
}

let state: QcMockState = load();
const listeners = new Set<() => void>();

function persist() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function setState(updater: (prev: QcMockState) => QcMockState) {
  state = updater(state);
  persist();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function getSnapshot() {
  return state;
}

// SSR-safe snapshot — siempre devuelve el mismo objeto inicial
const SERVER_SNAPSHOT = initialState;
function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

export function useQcMock<T>(selector: (s: QcMockState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(getSnapshot()),
    () => selector(getServerSnapshot()),
  );
}

// --- Helpers de evaluación ------------------------------------------------

export function evaluarMedicion(
  valor: number,
  min: number,
  max: number,
): MedicionEstado {
  if (Number.isNaN(valor)) return "pendiente";
  if (valor >= min && valor <= max) return "conforme";
  const tolerancia = (max - min) * 0.05;
  if (valor < min - tolerancia || valor > max + tolerancia) {
    return "fuera_rango_critico";
  }
  return "no_conforme";
}

// --- Acciones -------------------------------------------------------------

function uid() {
  return "mck-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export interface CrearMuestraInput {
  orden_id: string;
  numero_rollo: number | null;
  hora_muestreo: string;
  observaciones_generales: string;
  estado_destino: "borrador" | "pendiente_revision";
  capturado_por: string;
  mediciones: Array<{
    variable_id: string;
    variable_clave: string;
    valor: number;
    observacion: string;
  }>;
}

export function crearMuestra(input: CrearMuestraInput): {
  ok: true;
  muestra_id: string;
} | { ok: false; error: string } {
  const orden = state.ordenes.find((o) => o.orden_id === input.orden_id);
  if (!orden) return { ok: false, error: "Orden no encontrada" };
  if (orden.estado !== "en_proceso") {
    return { ok: false, error: `La orden está ${orden.estado}, no se pueden capturar muestras` };
  }

  const estadoMaq = state.maquinas_estado.find((m) => m.maquina_id === orden.maquina_id);
  if (!estadoMaq || estadoMaq.orden_activa_id == null) {
    return { ok: false, error: `La máquina ${orden.maquina_nombre} no tiene orden activa` };
  }
  if (estadoMaq.orden_activa_id !== orden.orden_id) {
    const folioActivo = state.ordenes.find((o) => o.orden_id === estadoMaq.orden_activa_id)?.folio ?? "desconocida";
    return {
      ok: false,
      error: `La máquina ${orden.maquina_nombre} tiene activa la orden ${folioActivo}, no ${orden.folio}`,
    };
  }

  const spec = orden.especificacion_congelada;
  const now = new Date().toISOString();
  const muestra_id = uid();

  const snapshot: MuestraCalidad["variables_snapshot_json"] = {};
  spec.variables.forEach((v) => {
    snapshot[v.clave] = { min: v.min_valor, obj: v.objetivo, max: v.max_valor, unidad: v.unidad, etiqueta: v.etiqueta };
  });

  const muestra: MuestraCalidad = {
    id: muestra_id,
    orden_id: orden.orden_id,
    producto_id: orden.producto_id,
    maquina_id: orden.maquina_id,
    planta_id: orden.planta_id,
    turno: orden.turno,
    operario_id: orden.operario_id,
    especificacion_id: spec.especificacion_id,
    especificacion_version: spec.version,
    numero_rollo: input.numero_rollo,
    hora_muestreo: input.hora_muestreo,
    tipo_muestreo: spec.estrategia_muestreo,
    observaciones_generales: input.observaciones_generales,
    estado: input.estado_destino,
    capturado_por: input.capturado_por,
    capturado_at: now,
    revisado_por: null,
    revisado_at: null,
    dictamen: null,
    dictamen_motivo: null,
    variables_snapshot_json: snapshot,
    created_at: now,
    updated_at: now,
  };

  const mediciones: MedicionCalidad[] = input.mediciones.map((m) => {
    const specVar = spec.variables.find((v) => v.variable_id === m.variable_id)!;
    return {
      id: uid(),
      muestra_id,
      variable_id: m.variable_id,
      variable_clave: m.variable_clave,
      valor: m.valor,
      min_snapshot: specVar.min_valor,
      objetivo_snapshot: specVar.objetivo,
      max_snapshot: specVar.max_valor,
      estado: evaluarMedicion(m.valor, specVar.min_valor, specVar.max_valor),
      observacion: m.observacion,
      created_at: now,
    };
  });

  setState((prev) => ({
    ...prev,
    muestras: [...prev.muestras, muestra],
    mediciones: [...prev.mediciones, ...mediciones],
  }));

  return { ok: true, muestra_id };
}

// --- Validación pre-captura (sin escribir) -------------------------------

export type CapturaBloqueo =
  | { tipo: "ok" }
  | { tipo: "orden_no_existe" }
  | { tipo: "orden_no_activa"; estado: string }
  | { tipo: "maquina_sin_orden"; maquina: string }
  | { tipo: "orden_distinta"; folioActivo: string; folioSeleccionado: string; maquina: string };

export function validarCaptura(orden_id: string): CapturaBloqueo {
  const orden = state.ordenes.find((o) => o.orden_id === orden_id);
  if (!orden) return { tipo: "orden_no_existe" };
  if (orden.estado !== "en_proceso") return { tipo: "orden_no_activa", estado: orden.estado };
  const estadoMaq = state.maquinas_estado.find((m) => m.maquina_id === orden.maquina_id);
  if (!estadoMaq || estadoMaq.orden_activa_id == null) {
    return { tipo: "maquina_sin_orden", maquina: orden.maquina_nombre };
  }
  if (estadoMaq.orden_activa_id !== orden.orden_id) {
    const folioActivo = state.ordenes.find((o) => o.orden_id === estadoMaq.orden_activa_id)?.folio ?? "desconocida";
    return { tipo: "orden_distinta", folioActivo, folioSeleccionado: orden.folio, maquina: orden.maquina_nombre };
  }
  return { tipo: "ok" };
}

// --- Borrador local en localStorage (separado del store de muestras) -----
//
// Permite recuperar lo capturado si el navegador se cierra antes de enviar.

const DRAFT_PREFIX = "qc-captura-draft:";

export function saveDraft(orden_id: string, draft: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DRAFT_PREFIX + orden_id, JSON.stringify({ draft, savedAt: Date.now() }));
  } catch {}
}

export function loadDraft<T>(orden_id: string): { draft: T; savedAt: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + orden_id);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearDraft(orden_id: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DRAFT_PREFIX + orden_id);
}

// --- Acciones de revisión -------------------------------------------------

type ResultRev = { ok: true } | { ok: false; error: string };

function updateMuestra(
  muestra_id: string,
  updater: (m: MuestraCalidad) => MuestraCalidad,
): ResultRev {
  const m = state.muestras.find((x) => x.id === muestra_id);
  if (!m) return { ok: false, error: "Muestra no encontrada" };
  if (m.estado !== "pendiente_revision") {
    return { ok: false, error: `La muestra ya no está pendiente (estado: ${m.estado})` };
  }
  setState((prev) => ({
    ...prev,
    muestras: prev.muestras.map((x) => (x.id === muestra_id ? updater(x) : x)),
  }));
  return { ok: true };
}

export function liberarMuestra(muestra_id: string, revisor: string, motivo: string): ResultRev {
  const now = new Date().toISOString();
  return updateMuestra(muestra_id, (m) => ({
    ...m,
    estado: "liberada",
    dictamen: "liberada",
    dictamen_motivo: motivo || null,
    revisado_por: revisor,
    revisado_at: now,
    updated_at: now,
  }));
}

export function rechazarMuestra(muestra_id: string, revisor: string, motivo: string): ResultRev {
  if (!motivo.trim()) return { ok: false, error: "El motivo de rechazo es obligatorio" };
  const now = new Date().toISOString();
  return updateMuestra(muestra_id, (m) => ({
    ...m,
    estado: "rechazada",
    dictamen: "rechazada",
    dictamen_motivo: motivo,
    revisado_por: revisor,
    revisado_at: now,
    updated_at: now,
  }));
}

export function liberarConConcesion(muestra_id: string, revisor: string, motivo: string): ResultRev {
  if (!motivo.trim()) return { ok: false, error: "La justificación de la concesión es obligatoria" };
  const now = new Date().toISOString();
  return updateMuestra(muestra_id, (m) => ({
    ...m,
    estado: "concesion",
    dictamen: "concesion",
    dictamen_motivo: motivo,
    revisado_por: revisor,
    revisado_at: now,
    updated_at: now,
  }));
}

export interface SolicitarAjusteInput {
  muestra_id: string;
  tipo_ajuste: AjusteCalidad["tipo_ajuste"];
  motivo: string;
  revisor: string;
}

export function solicitarAjuste(input: SolicitarAjusteInput): ResultRev {
  if (!input.motivo.trim()) return { ok: false, error: "El motivo del ajuste es obligatorio" };
  const m = state.muestras.find((x) => x.id === input.muestra_id);
  if (!m) return { ok: false, error: "Muestra no encontrada" };
  if (m.estado !== "pendiente_revision") {
    return { ok: false, error: `La muestra ya no está pendiente (estado: ${m.estado})` };
  }
  const now = new Date().toISOString();
  const ajuste: AjusteCalidad = {
    id: uid(),
    muestra_id: m.id,
    orden_id: m.orden_id,
    maquina_id: m.maquina_id,
    planta_id: m.planta_id,
    tipo_ajuste: input.tipo_ajuste,
    motivo: input.motivo,
    detectado_en: now,
    solicitado_por: input.revisor,
    solicitado_at: now,
    autorizado_por: null,
    autorizado_at: null,
    ajustado_por: null,
    ajustado_at: null,
    accion_realizada: null,
    resultado: "pendiente",
    evidencia_url: null,
    observacion_ajuste: null,
    created_at: now,
    updated_at: now,
  };
  const destino: MuestraCalidad["estado"] = input.tipo_ajuste === "reproceso" ? "reproceso" : "en_ajuste";
  setState((prev) => ({
    ...prev,
    ajustes: [...prev.ajustes, ajuste],
    muestras: prev.muestras.map((x) =>
      x.id === m.id
        ? {
            ...x,
            estado: destino,
            dictamen_motivo: input.motivo,
            revisado_por: input.revisor,
            revisado_at: now,
            updated_at: now,
          }
        : x,
    ),
  }));
  return { ok: true };
}

// --- Reseteo (útil para pruebas) ------------------------------------------

export function resetQcMock() {
  state = { ...initialState, muestras: [], mediciones: [], ajustes: [] };
  persist();
  listeners.forEach((l) => l());
}
