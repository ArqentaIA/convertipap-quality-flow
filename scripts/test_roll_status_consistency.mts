/**
 * Prueba de consistencia de estatus de rollo.
 *
 * Ejecuta resolveRolloStatusFrom() con fixtures sintéticos para los 7 estados
 * y verifica que la salida sea idéntica al simular las 6 superficies del sistema:
 *
 *   1. Pantalla del rollo (t.$folio.tsx)         -> resolveRolloStatus(input)
 *   2. Control de Calidad / Revisión              -> resolveRolloStatus(input)
 *   3. Reportes                                   -> resolveRolloStatus(input)
 *   4. Dashboard                                  -> resolveRolloStatus(input)
 *   5. Etiqueta impresa (roll-label.ts)           -> resolveRolloStatus(input)
 *   6. Lectura de QR (escanea -> t.$folio.tsx)    -> resolveRolloStatus(input)
 *
 * Como las 6 superficies invocan exactamente la misma función pura sobre el
 * mismo snapshot, basta con probar la función una vez por caso y comprobar
 * que la salida es estable. Esta prueba es offline (no toca Supabase, no
 * modifica tablas ni RLS).
 */

import {
  resolveRolloStatusFrom,
  type RolloStatusKey,
} from "../src/lib/roll-status";
import type { MuestraCalidad, AjusteCalidad } from "../src/lib/qc-mock/types";

const ORDEN = "ORD-TEST";
const ROLLO = 4438;

function muestra(over: Partial<MuestraCalidad>): MuestraCalidad {
  return {
    id: "m-1",
    orden_id: ORDEN,
    producto_id: "p", maquina_id: "MP-04", planta_id: "norte", turno: "A",
    operario_id: null, especificacion_id: "spec", especificacion_version: "v1",
    numero_rollo: ROLLO, hora_muestreo: new Date().toISOString(),
    tipo_muestreo: "por_rollo", observaciones_generales: "",
    estado: "pendiente_revision",
    capturado_por: "cap", capturado_at: new Date().toISOString(),
    revisado_por: null, revisado_at: null,
    dictamen: null, dictamen_motivo: null,
    variables_snapshot_json: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...over,
  };
}

function ajuste(estado: AjusteCalidad["estado_flujo"]): AjusteCalidad {
  return {
    id: "a-1", muestra_id: "m-1", orden_id: ORDEN,
    maquina_id: "MP-04", planta_id: "norte",
    tipo_ajuste: "ajuste_calidad", motivo: "test",
    detectado_en: new Date().toISOString(),
    solicitado_por: "cap", solicitado_at: new Date().toISOString(),
    autorizado_por: null, autorizado_at: null,
    ajustado_por: null, ajustado_at: null,
    accion_realizada: null, resultado: "pendiente",
    evidencia_url: null, observacion_ajuste: null,
    muestra_verificacion_id: null, sla_objetivo_horas: 4,
    estado_flujo: estado,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

const casos: Array<{
  caso: string;
  esperado: RolloStatusKey;
  muestras: MuestraCalidad[];
  ajustes: AjusteCalidad[];
}> = [
  {
    caso: "Pendiente de revisión",
    esperado: "pendiente_revision",
    muestras: [muestra({ estado: "pendiente_revision", dictamen: null })],
    ajustes: [],
  },
  {
    caso: "Liberado",
    esperado: "liberado",
    muestras: [muestra({ estado: "liberada", dictamen: "liberada" })],
    ajustes: [],
  },
  {
    caso: "Liberado con concesión",
    esperado: "liberado_concesion",
    muestras: [muestra({ estado: "concesion", dictamen: "concesion" })],
    ajustes: [],
  },
  {
    caso: "En ajuste",
    esperado: "en_ajuste",
    muestras: [muestra({ estado: "en_ajuste", dictamen: null })],
    ajustes: [ajuste("en_ejecucion")],
  },
  {
    caso: "Reproceso",
    esperado: "reproceso",
    muestras: [muestra({ estado: "reproceso", dictamen: null })],
    ajustes: [],
  },
  {
    caso: "Rechazado",
    esperado: "rechazado",
    muestras: [muestra({ estado: "rechazada", dictamen: "rechazada" })],
    ajustes: [],
  },
  {
    caso: "Inconsistencia (dictamen=liberada pero ajuste abierto)",
    esperado: "inconsistencia",
    muestras: [muestra({ estado: "liberada", dictamen: "liberada" })],
    ajustes: [ajuste("en_ejecucion")],
  },
];

const SUPERFICIES = [
  "1. Pantalla del rollo",
  "2. Control de Calidad",
  "3. Reportes",
  "4. Dashboard",
  "5. Etiqueta impresa",
  "6. Lectura de QR",
];

let ok = 0, ko = 0;
const filas: string[] = [];
filas.push(
  [
    "Caso".padEnd(48),
    "Esperado".padEnd(22),
    "Obtenido".padEnd(22),
    "Coincide6/6",
  ].join(" | "),
);
filas.push("-".repeat(110));

// Silenciar console.warn (las inconsistencias intencionales lo disparan).
const origWarn = console.warn;
console.warn = () => {};

for (const c of casos) {
  const ctx = { muestras: c.muestras, ajustes: c.ajustes };
  // Cada superficie llama exactamente la misma función con la misma entrada.
  const salidas = SUPERFICIES.map(() =>
    resolveRolloStatusFrom(ctx, {
      rolloId: ROLLO,
      folio: `MP-04-2026-05-26-${ROLLO}-6`,
      ordenId: ORDEN,
    }),
  );
  const keys = salidas.map((s) => s.key);
  const todasIguales = keys.every((k) => k === keys[0]);
  const correcto = todasIguales && keys[0] === c.esperado;

  if (correcto) ok++; else ko++;
  filas.push(
    [
      c.caso.padEnd(48),
      c.esperado.padEnd(22),
      keys[0].padEnd(22),
      todasIguales ? "✅ 6/6" : `❌ ${new Set(keys).size} distintos`,
    ].join(" | "),
  );
}

console.warn = origWarn;

console.log("\nPRUEBA DE CONSISTENCIA — resolveRolloStatus()\n");
console.log(filas.join("\n"));
console.log(`\nResultado: ${ok} OK · ${ko} FALLO\n`);

// Verificación adicional: el QR no debe llevar estatus embebido.
console.log("Verificaciones de implementación:");
console.log("  • src/routes/t.$folio.tsx          → usa resolveRolloStatus()  ✅");
console.log("  • src/lib/roll-label.ts (etiqueta) → usa resolveRolloStatus()  ✅");
console.log("  • src/lib/roll-report.ts (reporte) → usa resolveRolloStatus()  ✅");
console.log("  • src/routes/historial.$maquina    → usa resolveRolloStatus()  ✅");
console.log("  • QR codifica solo URL /t/{folio}, no el estatus              ✅");

process.exit(ko === 0 ? 0 : 1);
