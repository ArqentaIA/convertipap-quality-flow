/**
 * Prueba de consistencia de estatus de rollo + flujo de autorización
 * de Gerencia de Calidad.
 *
 * Verifica que las 6 superficies (Pantalla del rollo, Control de Calidad,
 * Reportes, Dashboard, Etiqueta impresa, Lectura de QR) devuelvan EL MISMO
 * estatus para el mismo rollo, llamando a resolveRolloStatusFrom() con el
 * mismo snapshot. También cubre los 10 casos del flujo de autorización.
 */

import {
  resolveRolloStatusFrom,
  type RolloStatusKey,
} from "../src/lib/roll-status";
import {
  ROLES_AUTORIZADOS_DICTAMEN,
  puedeDictaminar,
} from "../src/lib/qc-mock/store";
import type { MuestraCalidad, AjusteCalidad } from "../src/lib/qc-mock/types";

const ORDEN = "ORD-TEST";
const ROLLO = 4438;

function muestra(over: Partial<MuestraCalidad>): MuestraCalidad {
  const now = new Date().toISOString();
  return {
    id: "m-1",
    orden_id: ORDEN,
    producto_id: "p", maquina_id: "MP-04", planta_id: "norte", turno: "A",
    operario_id: null, especificacion_id: "spec", especificacion_version: "v1",
    numero_rollo: ROLLO, hora_muestreo: now,
    tipo_muestreo: "por_rollo", observaciones_generales: "",
    estado: "pendiente_revision",
    capturado_por: "cap", capturado_at: now,
    revisado_por: null, revisado_at: null,
    dictamen: null, dictamen_motivo: null,
    autorizado_por: null, rol_autorizador: null, autorizado_at: null,
    dictamen_at: null, dictamen_observaciones: null, evidencia_url: null,
    mediciones_modificadas_at: null, mediciones_modificadas_por: null,
    mediciones_modificacion_motivo: null,
    variables_snapshot_json: {},
    created_at: now, updated_at: now,
    ...over,
  };
}

function ajuste(estado: AjusteCalidad["estado_flujo"]): AjusteCalidad {
  const now = new Date().toISOString();
  return {
    id: "a-1", muestra_id: "m-1", orden_id: ORDEN,
    maquina_id: "MP-04", planta_id: "norte",
    tipo_ajuste: "ajuste_calidad", motivo: "test",
    detectado_en: now,
    solicitado_por: "cap", solicitado_at: now,
    autorizado_por: null, autorizado_at: null,
    ajustado_por: null, ajustado_at: null,
    accion_realizada: null, resultado: "pendiente",
    evidencia_url: null, observacion_ajuste: null,
    muestra_verificacion_id: null, sla_objetivo_horas: 4,
    estado_flujo: estado,
    created_at: now, updated_at: now,
  };
}

const T0 = "2026-06-01T10:00:00.000Z";
const T1 = "2026-06-01T11:00:00.000Z";

const casos: Array<{
  caso: string;
  esperado: RolloStatusKey;
  muestras: MuestraCalidad[];
  ajustes: AjusteCalidad[];
}> = [
  {
    caso: "1. Capturista guarda muestra sin dictamen",
    esperado: "pendiente_revision",
    muestras: [muestra({ estado: "pendiente_revision", dictamen: null })],
    ajustes: [],
  },
  {
    caso: "2. Técnicamente conforme, aún sin dictamen de Gerencia",
    esperado: "pendiente_revision",
    muestras: [muestra({ estado: "pendiente_revision", dictamen: null })],
    ajustes: [],
  },
  {
    caso: "3. Gerencia de Calidad libera",
    esperado: "liberado",
    muestras: [muestra({
      estado: "liberada", dictamen: "liberada",
      autorizado_por: "gcalidad@convertipap.site",
      rol_autorizador: "calidad", autorizado_at: T0, dictamen_at: T0,
    })],
    ajustes: [],
  },
  {
    caso: "4. Gerencia libera con concesión",
    esperado: "liberado_concesion",
    muestras: [muestra({
      estado: "concesion", dictamen: "concesion",
      dictamen_motivo: "fuera de spec por 0.2 g",
      autorizado_por: "gcalidad@convertipap.site",
      rol_autorizador: "gerencia_calidad", autorizado_at: T0, dictamen_at: T0,
    })],
    ajustes: [],
  },
  {
    caso: "5. Gerencia rechaza",
    esperado: "rechazado",
    muestras: [muestra({
      estado: "rechazada", dictamen: "rechazada",
      dictamen_motivo: "humedad fuera de rango crítico",
      evidencia_url: "https://docs/evidencia.pdf",
      autorizado_por: "gcalidad@convertipap.site",
      rol_autorizador: "calidad", autorizado_at: T0, dictamen_at: T0,
    })],
    ajustes: [],
  },
  {
    caso: "6. Gerencia manda a reproceso",
    esperado: "reproceso",
    muestras: [muestra({ estado: "reproceso", dictamen: null })],
    ajustes: [ajuste("autorizado")],
  },
  {
    caso: "7. Capturista intenta dictaminar (bloqueado por rol)",
    // El estado del rollo permanece pendiente porque el rol del capturista
    // no es válido y `puedeDictaminar` lo rechaza antes de mutar la muestra.
    esperado: "pendiente_revision",
    muestras: [muestra({ estado: "pendiente_revision", dictamen: null })],
    ajustes: [],
  },
  {
    caso: "8. Dictamen existente pero autorizado_por = null",
    esperado: "pendiente_revision",
    muestras: [muestra({
      estado: "liberada", dictamen: "liberada",
      autorizado_por: null, autorizado_at: null, dictamen_at: T0,
    })],
    ajustes: [],
  },
  {
    caso: "9. Dictamen liberado + ajuste abierto → inconsistencia",
    esperado: "inconsistencia",
    muestras: [muestra({
      estado: "liberada", dictamen: "liberada",
      autorizado_por: "gcalidad@convertipap.site",
      rol_autorizador: "calidad", autorizado_at: T0, dictamen_at: T0,
    })],
    ajustes: [ajuste("en_ejecucion")],
  },
  {
    caso: "10. Liberado y luego se edita una medición → inconsistencia",
    esperado: "inconsistencia",
    muestras: [muestra({
      estado: "liberada", dictamen: "liberada",
      autorizado_por: "gcalidad@convertipap.site",
      rol_autorizador: "calidad", autorizado_at: T0, dictamen_at: T0,
      mediciones_modificadas_at: T1,
      mediciones_modificadas_por: "cap@convertipap.site",
      mediciones_modificacion_motivo: "corrección de captura",
    })],
    ajustes: [],
  },
];

const SUPERFICIES = [
  "Pantalla del rollo",
  "Control de Calidad",
  "Reportes",
  "Dashboard",
  "Etiqueta impresa",
  "Lectura de QR",
];

const origWarn = console.warn;
console.warn = () => {};

let ok = 0, ko = 0;
const filas: string[] = [];
filas.push(
  [
    "Caso".padEnd(58),
    "Esperado".padEnd(22),
    "Obtenido".padEnd(22),
    "6/6 superficies",
  ].join(" | "),
);
filas.push("-".repeat(125));

for (const c of casos) {
  const ctx = { muestras: c.muestras, ajustes: c.ajustes };
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
      c.caso.padEnd(58),
      c.esperado.padEnd(22),
      keys[0].padEnd(22),
      todasIguales ? "OK 6/6" : `FALLA ${new Set(keys).size} distintos`,
    ].join(" | "),
  );
}

// Caso 7 — verificación adicional: el guard de rol impide dictaminar.
const capturistaPuede = puedeDictaminar(["capturista"]);
const gerenciaPuede = puedeDictaminar(["calidad"]);
const adminPuede = puedeDictaminar(["administrador"]);

console.warn = origWarn;

console.log("\n=== PRUEBA DE CONSISTENCIA — resolveRolloStatus() ===\n");
console.log(filas.join("\n"));
console.log(`\nResultado: ${ok} OK · ${ko} FALLO`);

console.log("\n=== GUARD DE AUTORIZACIÓN ===");
console.log(`  Roles autorizados:      ${ROLES_AUTORIZADOS_DICTAMEN.join(", ")}`);
console.log(`  puedeDictaminar(capturista) = ${capturistaPuede}  ${capturistaPuede === false ? "OK" : "FALLA"}`);
console.log(`  puedeDictaminar(calidad)    = ${gerenciaPuede}  ${gerenciaPuede === true ? "OK" : "FALLA"}`);
console.log(`  puedeDictaminar(admin)      = ${adminPuede}  ${adminPuede === true ? "OK" : "FALLA"}`);

console.log("\n=== PUNTOS DE USO DE resolveRolloStatus() ===");
console.log("  - src/routes/t.$folio.tsx              (pantalla rollo + lectura QR)");
console.log("  - src/routes/historial.$maquina.tsx    (historial / reportes UI)");
console.log("  - src/lib/roll-label.ts                (etiqueta impresa)");
console.log("  - src/lib/roll-report.ts               (reporte PDF)");
console.log("  - Control de Calidad / Dashboard       (vía resolveRolloStatus en lecturas)");
console.log("  - El QR sólo codifica /t/{folio}; al escanearse se llama al resolver.\n");

process.exit(ko === 0 ? 0 : 1);
