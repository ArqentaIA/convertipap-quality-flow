// Cálculo puro de SLA de ajustes. Se evalúa contra los campos reales de
// la tabla `ajustes_calidad`: solicitado_at, ajustado_at, estado_flujo y
// sla_objetivo_horas.

export type SlaEstado = "verde" | "amarillo" | "rojo" | "cumplido";

export interface AjusteSlaInput {
  solicitado_at: string;
  ajustado_at: string | null;
  estado_flujo: string;
  sla_objetivo_horas: number;
}

export function calcularSla(
  ajuste: AjusteSlaInput,
  ahora: Date = new Date(),
): { estado: SlaEstado; transcurridoHoras: number; restantesHoras: number } {
  const inicio = new Date(ajuste.solicitado_at).getTime();
  const fin = ajuste.ajustado_at ? new Date(ajuste.ajustado_at).getTime() : ahora.getTime();
  const transcurridoHoras = (fin - inicio) / 36e5;
  const restantesHoras = ajuste.sla_objetivo_horas - transcurridoHoras;
  let estado: SlaEstado;
  if (ajuste.estado_flujo === "cerrado") {
    estado = transcurridoHoras <= ajuste.sla_objetivo_horas ? "cumplido" : "rojo";
  } else if (restantesHoras < 0) estado = "rojo";
  else if (restantesHoras < ajuste.sla_objetivo_horas * 0.25) estado = "amarillo";
  else estado = "verde";
  return { estado, transcurridoHoras, restantesHoras };
}
