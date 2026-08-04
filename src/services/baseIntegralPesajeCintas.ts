// =============================================================================
// Reporte 3 — Base Integral de Pesaje de Cintas
// Libro independiente (no usa plantillas). Hojas: RESUMEN, LOTES, CINTAS,
// IMPRESIONES_QR, AUDITORIA_CINTAS, ORIGEN_ROLLO, CALIDAD_RELACIONADA,
// CATALOGOS_UTILIZADOS.
// =============================================================================
import type { Worksheet } from "exceljs";
import { descargarLibro, ReporteCintasError } from "./cintas-plantilla-base";
import type { BaseIntegralCintas, JsonRow } from "@/lib/reportes-cintas.functions";
import type { Json } from "@/lib/pesaje-cintas.functions";

type Col = { header: string; width: number; key: string; tipo?: "num" | "fecha" | "texto" };

function snap(s: Json | undefined | null): Record<string, unknown> {
  return s && typeof s === "object" && !Array.isArray(s) ? (s as Record<string, unknown>) : {};
}
function med(sn: Record<string, unknown>, clave: string): number | null {
  const m = sn["mediciones"];
  if (!m || typeof m !== "object") return null;
  const v = (m as Record<string, unknown>)[clave];
  if (!v || typeof v !== "object") return null;
  const val = (v as Record<string, unknown>)["valor"];
  return typeof val === "number" ? val : null;
}
function d(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const x = new Date(v);
  return Number.isNaN(x.getTime()) ? null : x;
}
function jstr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

function hoja(
  wb: Parameters<typeof descargarLibro>[0],
  nombre: string,
  cols: Col[],
  filas: Record<string, unknown>[],
): Worksheet {
  const ws = wb.addWorksheet(nombre);
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B2D5B" } };
  head.alignment = { vertical: "middle", wrapText: true };
  head.height = 26;
  for (const f of filas) ws.addRow(f);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.tipo === "num") col.numFmt = "#,##0.00";
    if (c.tipo === "fecha") col.numFmt = "dd/mm/yyyy hh:mm";
    if (c.tipo === "texto") col.alignment = { horizontal: "left", wrapText: true };
  });
  return ws;
}

export async function generarBaseIntegralCintas(
  data: BaseIntegralCintas,
  fileName: string,
): Promise<{ fileName: string; lotes: number; cintas: number }> {
  if (data.lotes.length === 0) throw new ReporteCintasError("SIN_REGISTROS");
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "ConvertiPap QMS";
  wb.created = new Date();

  const nombrePorId = (rows: JsonRow[], campo = "nombre") =>
    new Map(rows.map((r) => [String(r["id"]), String(r[campo] ?? "")]));
  const maquinas = nombrePorId(data.maquinas, "codigo");
  const perfiles = nombrePorId(data.perfiles);

  const cintasPorLote = new Map<string, typeof data.cintas>();
  for (const c of data.cintas) {
    const arr = cintasPorLote.get(c.lote_id) ?? [];
    arr.push(c);
    cintasPorLote.set(c.lote_id, arr);
  }
  const loteById = new Map(data.lotes.map((l) => [l.id, l]));

  // ------------------------------ RESUMEN ---------------------------------- //
  const registradas = data.cintas.filter((c) => c.estado === "registrada");
  const anuladas = data.cintas.filter((c) => c.estado === "anulada");
  const sustituidas = data.cintas.filter((c) => c.estado === "sustituida");
  const pesoNeto = data.lotes.reduce((a, l) => a + (Number(l.peso_bobina_madre_neto_kg) || 0), 0);
  const pesoCintas = registradas.reduce((a, c) => a + (Number(c.peso_cinta_kg) || 0), 0);
  const mermaPeso = data.lotes.reduce((a, l) => a + (Number(l.peso_mermas_kg ?? l.merma_real_kg) || 0), 0);
  const uniones = registradas.reduce((a, c) => a + (Number(c.uniones) || 0), 0);
  const impresionesOrig = data.impresiones.filter((i) => i["tipo"] === "ORIGINAL").length;
  const reimpresiones = data.impresiones.filter((i) => i["tipo"] === "REIMPRESION").length;

  const ws0 = wb.addWorksheet("RESUMEN");
  ws0.getColumn(1).width = 42;
  ws0.getColumn(2).width = 30;
  ws0.mergeCells("A1:B1");
  const t = ws0.getCell("A1");
  t.value = `BASE INTEGRAL DE PESAJE DE CINTAS · ${data.planta}`;
  t.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
  t.alignment = { horizontal: "center", vertical: "middle" };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B2D5B" } };
  ws0.getRow(1).height = 26;
  const kpis: [string, string | number][] = [
    ["Periodo", `${data.fechaInicio} a ${data.fechaFin}`],
    ["Turno seleccionado", data.turno || "Todos"],
    ["Lotes incluidos", data.lotes.length],
    ["Rollos de origen", new Set(data.lotes.map((l) => l.numero_rollo)).size],
    ["Cintas registradas", registradas.length],
    ["Cintas anuladas", anuladas.length],
    ["Cintas sustituidas", sustituidas.length],
    ["Peso neto total (kg)", round2(pesoNeto)],
    ["Peso real total de cintas (kg)", round2(pesoCintas)],
    ["Merma por Sistema total (kg)", round2(pesoNeto - pesoCintas)],
    ["Peso de Mermas total (kg)", round2(mermaPeso)],
    ["Total de uniones", uniones],
    ["Total de impresiones", impresionesOrig],
    ["Total de reimpresiones", reimpresiones],
    ["Generado por", data.usuario],
    ["Generado el", new Date(data.generadoAt).toLocaleString("es-MX")],
  ];
  kpis.forEach(([k, v], i) => {
    const r = ws0.getRow(3 + i);
    r.getCell(1).value = k;
    r.getCell(1).font = { bold: true };
    r.getCell(2).value = v;
  });

  // ------------------------------- LOTES ----------------------------------- //
  hoja(wb, "LOTES", [
    { header: "ID de lote", width: 38, key: "id", tipo: "texto" },
    { header: "No. rollo original", width: 16, key: "rollo", tipo: "texto" },
    { header: "Orden de Producción", width: 18, key: "orden", tipo: "texto" },
    { header: "Origen del rollo", width: 16, key: "origen", tipo: "texto" },
    { header: "ID pesaje bobina madre", width: 38, key: "pesaje", tipo: "texto" },
    { header: "ID muestra calidad", width: 38, key: "muestra", tipo: "texto" },
    { header: "Peso neto (kg)", width: 14, key: "neto", tipo: "num" },
    { header: "Diámetro (cm)", width: 13, key: "dcm", tipo: "num" },
    { header: "Diámetro (m)", width: 13, key: "dm", tipo: "num" },
    { header: "Uniones rollo origen", width: 16, key: "uniones", tipo: "num" },
    { header: "Producto", width: 28, key: "producto", tipo: "texto" },
    { header: "Máquina", width: 12, key: "maquina", tipo: "texto" },
    { header: "Turno", width: 8, key: "turno", tipo: "texto" },
    { header: "Bobinadora", width: 18, key: "bobinadora", tipo: "texto" },
    { header: "Conductor / operador", width: 24, key: "conductor", tipo: "texto" },
    { header: "Estado del lote", width: 14, key: "estado", tipo: "texto" },
    { header: "Cintas vigentes", width: 13, key: "cantidad", tipo: "num" },
    { header: "Peso acumulado real (kg)", width: 18, key: "acum", tipo: "num" },
    { header: "Peso de Mermas (kg)", width: 18, key: "mermaPeso", tipo: "num" },
    { header: "% Peso de Mermas", width: 16, key: "mermaPct", tipo: "num" },
    { header: "Fecha operativa", width: 14, key: "fechaOp", tipo: "texto" },
    { header: "Fecha de creación", width: 18, key: "creado", tipo: "fecha" },
    { header: "Usuario creador", width: 24, key: "creador", tipo: "texto" },
    { header: "Fecha de finalización", width: 18, key: "finAt", tipo: "fecha" },
    { header: "Usuario que finalizó", width: 24, key: "finBy", tipo: "texto" },
    { header: "Captura manual", width: 12, key: "manual", tipo: "texto" },
    { header: "Snapshot de calidad", width: 60, key: "snapshot", tipo: "texto" },
  ], data.lotes.map((l) => {
    const sn = snap(l.datos_calidad_snapshot);
    const dcm = med(sn, "diametro");
    const neto = Number(l.peso_bobina_madre_neto_kg) || 0;
    const acum = Number(l.peso_total_cintas_kg) || 0;
    return {
      id: l.id,
      rollo: l.numero_rollo,
      orden: l.numero_orden ?? "",
      origen: l.es_manual ? "captura_manual" : "sistema",
      pesaje: l.pesaje_bobina_madre_id ?? "",
      muestra: l.muestra_calidad_id ?? "",
      neto: round2(neto),
      dcm: dcm ?? null,
      dm: dcm == null ? null : round2(dcm / 100),
      uniones: med(sn, "uniones"),
      producto: l.producto_nombre ?? l.producto_codigo ?? "",
      maquina: String(sn["maquina_codigo"] ?? sn["maquina"] ?? ""),
      turno: String(sn["turno"] ?? ""),
      bobinadora: l.bobinadora_nombre_snapshot,
      conductor: l.conductor_nombre_snapshot,
      estado: l.estado,
      cantidad: l.cantidad_cintas,
      acum: round2(acum),
      mermaPeso: pesoMermas == null ? null : round2(pesoMermas),
      mermaPct: pesoMermas == null || !(neto > 0) ? null : round2((pesoMermas / neto) * 100),
      fechaOp: l.fecha_produccion ?? "",
      creado: d(l.created_at),
      creador: perfiles.get(String(l.creado_por)) ?? l.creado_por ?? "",
      finAt: d(l.finalizado_at),
      finBy: perfiles.get(String(l.finalizado_por)) ?? l.finalizado_por ?? "",
      manual: l.es_manual ? "Sí" : "No",
      snapshot: jstr(l.datos_calidad_snapshot),
    };
  }));

  // ------------------------------- CINTAS ---------------------------------- //
  const cintasOrdenadas = [...data.cintas].sort((a, b) => {
    const ra = loteById.get(a.lote_id)?.numero_rollo ?? "";
    const rb = loteById.get(b.lote_id)?.numero_rollo ?? "";
    const cmp = ra.localeCompare(rb, "es", { numeric: true, sensitivity: "base" });
    if (cmp !== 0) return cmp;
    if (a.lote_id !== b.lote_id) return a.lote_id.localeCompare(b.lote_id);
    return a.posicion - b.posicion;
  });
  hoja(wb, "CINTAS", [
    { header: "No. rollo original", width: 16, key: "rollo", tipo: "texto" },
    { header: "No. derivado", width: 18, key: "derivado", tipo: "texto" },
    { header: "Posición", width: 9, key: "pos" },
    { header: "Turno", width: 8, key: "turno", tipo: "texto" },
    { header: "Peso real (kg)", width: 14, key: "peso", tipo: "num" },
    { header: "Ancho útil (cm)", width: 14, key: "ancho", tipo: "num" },
    { header: "Uniones", width: 10, key: "uniones" },
    { header: "Observaciones", width: 34, key: "obs", tipo: "texto" },
    { header: "Estado", width: 13, key: "estado", tipo: "texto" },
    { header: "Bobinadora", width: 18, key: "bobinadora", tipo: "texto" },
    { header: "Conductor / operador", width: 24, key: "conductor", tipo: "texto" },
    { header: "Fecha y hora de registro", width: 19, key: "creado", tipo: "fecha" },
    { header: "Usuario que registró", width: 24, key: "creador", tipo: "texto" },
    { header: "Fecha de actualización", width: 19, key: "upd", tipo: "fecha" },
    { header: "Usuario que actualizó", width: 24, key: "updBy", tipo: "texto" },
  ], cintasOrdenadas.map((c) => {
    const l = loteById.get(c.lote_id);
    return {
      rollo: l?.numero_rollo ?? "",
      derivado: l ? `${l.numero_rollo}-C${c.posicion}` : "",
      pos: c.posicion,
      turno: String(snap(l?.datos_calidad_snapshot)["turno"] ?? ""),
      peso: round2(Number(c.peso_cinta_kg) || 0),
      ancho: round2(Number(c.ancho_util) || 0),
      uniones: c.uniones,
      obs: c.observaciones ?? "",
      estado: c.estado,
      bobinadora: l?.bobinadora_nombre_snapshot ?? "",
      conductor: l?.conductor_nombre_snapshot ?? "",
      creado: d(c.created_at),
      creador: perfiles.get(String(c.creado_por)) ?? c.creado_por ?? "",
      upd: d(c.updated_at),
      updBy: perfiles.get(String(c.actualizado_por)) ?? c.actualizado_por ?? "",
    };
  }));


  // ---------------------------- IMPRESIONES_QR ----------------------------- //
  const cintaById = new Map(data.cintas.map((c) => [c.id, c]));
  hoja(wb, "IMPRESIONES_QR", [
    { header: "ID de impresión", width: 38, key: "id", tipo: "texto" },
    { header: "ID de lote", width: 38, key: "lote", tipo: "texto" },
    { header: "ID de cinta", width: 38, key: "cinta", tipo: "texto" },
    { header: "No. rollo original", width: 16, key: "rollo", tipo: "texto" },
    { header: "No. compuesto", width: 18, key: "compuesto", tipo: "texto" },
    { header: "No. de impresión", width: 14, key: "num" },
    { header: "Versión", width: 10, key: "ver" },
    { header: "Tipo", width: 14, key: "tipo", tipo: "texto" },
    { header: "Motivo de reimpresión", width: 30, key: "motivo", tipo: "texto" },
    { header: "Estado de la cinta", width: 14, key: "estado", tipo: "texto" },
    { header: "Total de uniones", width: 14, key: "uniones" },
    { header: "Fecha y hora", width: 19, key: "fecha", tipo: "fecha" },
    { header: "Usuario", width: 24, key: "user", tipo: "texto" },
    { header: "Snapshot impreso", width: 60, key: "snap", tipo: "texto" },
    { header: "Contenido QR", width: 60, key: "qr", tipo: "texto" },
  ], data.impresiones.map((i) => {
    const cintaId = i["cinta_id"] as string | null;
    const cinta = cintaId ? cintaById.get(cintaId) : undefined;
    const l = loteById.get(String(i["lote_id"]));
    return {
      id: String(i["id"] ?? ""),
      lote: String(i["lote_id"] ?? ""),
      cinta: cintaId ?? "",
      rollo: l?.numero_rollo ?? "",
      compuesto: cinta && l ? `${l.numero_rollo}-C${cinta.posicion}` : (l?.numero_rollo ?? ""),
      num: i["numero_impresion"] as number,
      ver: i["version_etiqueta"] as number,
      tipo: String(i["tipo"] ?? ""),
      motivo: String(i["motivo_reimpresion"] ?? ""),
      estado: cinta?.estado ?? "",
      uniones: i["total_uniones_cintas"] as number,
      fecha: d(i["impreso_en"]),
      user: perfiles.get(String(i["impreso_por"])) ?? String(i["impreso_por"] ?? ""),
      snap: jstr(i["datos_impresion_snapshot"]),
      qr: jstr(i["qr_contenido"]),
    };
  }));

  // --------------------------- AUDITORIA_CINTAS ---------------------------- //
  hoja(wb, "AUDITORIA_CINTAS", [
    { header: "ID", width: 38, key: "id", tipo: "texto" },
    { header: "Lote", width: 38, key: "lote", tipo: "texto" },
    { header: "Cinta", width: 38, key: "cinta", tipo: "texto" },
    { header: "Acción", width: 24, key: "accion", tipo: "texto" },
    { header: "Valor anterior", width: 46, key: "ant", tipo: "texto" },
    { header: "Valor nuevo", width: 46, key: "nue", tipo: "texto" },
    { header: "Motivo", width: 34, key: "motivo", tipo: "texto" },
    { header: "Usuario", width: 24, key: "user", tipo: "texto" },
    { header: "Fecha y hora", width: 19, key: "fecha", tipo: "fecha" },
  ], data.auditoria.map((a) => ({
    id: String(a["id"] ?? ""),
    lote: String(a["lote_id"] ?? ""),
    cinta: String(a["cinta_id"] ?? ""),
    accion: String(a["accion"] ?? ""),
    ant: jstr(a["valores_anteriores"]),
    nue: jstr(a["valores_nuevos"]),
    motivo: String(a["motivo"] ?? ""),
    user: perfiles.get(String(a["realizado_por"])) ?? String(a["realizado_por"] ?? ""),
    fecha: d(a["realizado_en"]),
  })));

  // ----------------------------- ORIGEN_ROLLO ------------------------------ //
  hoja(wb, "ORIGEN_ROLLO", [
    { header: "ID", width: 38, key: "id", tipo: "texto" },
    { header: "No. de rollo", width: 16, key: "rollo", tipo: "texto" },
    { header: "Peso bruto (kg)", width: 14, key: "bruto", tipo: "num" },
    { header: "Tara / eje (kg)", width: 14, key: "tara", tipo: "num" },
    { header: "Peso neto (kg)", width: 14, key: "neto", tipo: "num" },
    { header: "Máquina", width: 12, key: "maquina", tipo: "texto" },
    { header: "Orden", width: 18, key: "orden", tipo: "texto" },
    { header: "Evidencia (referencia)", width: 46, key: "evidencia", tipo: "texto" },
    { header: "Usuario", width: 24, key: "user", tipo: "texto" },
    { header: "Fecha y hora", width: 19, key: "fecha", tipo: "fecha" },
  ], data.bobinaMadre.map((p) => ({
    id: String(p["id"] ?? ""),
    rollo: String(p["numero_rollo"] ?? ""),
    bruto: Number(p["peso_bruto_kg"] ?? 0),
    tara: Number(p["peso_eje_kg"] ?? 0),
    neto: Number(p["peso_neto_kg"] ?? 0),
    maquina: String(p["maquina_codigo"] ?? maquinas.get(String(p["maquina_id"])) ?? ""),
    orden: String(p["numero_orden"] ?? ""),
    evidencia: String(p["evidencia_path"] ?? ""),
    user: perfiles.get(String(p["capturado_por"])) ?? String(p["capturado_por"] ?? ""),
    fecha: d(p["fecha_hora_pesaje"]),
  })));

  // -------------------------- CALIDAD_RELACIONADA -------------------------- //
  const muestraById = new Map(data.muestras.map((m) => [String(m["id"]), m]));
  const productos = new Map(data.productos.map((p) => [String(p["id"]), String(p["nombre"] ?? p["codigo"] ?? "")]));
  hoja(wb, "CALIDAD_RELACIONADA", [
    { header: "ID de muestra", width: 38, key: "muestra", tipo: "texto" },
    { header: "No. de rollo", width: 16, key: "rollo", tipo: "texto" },
    { header: "Producto", width: 28, key: "producto", tipo: "texto" },
    { header: "Máquina", width: 12, key: "maquina", tipo: "texto" },
    { header: "Turno", width: 8, key: "turno", tipo: "texto" },
    { header: "Variable", width: 24, key: "variable", tipo: "texto" },
    { header: "Clave de variable", width: 20, key: "clave", tipo: "texto" },
    { header: "Valor", width: 12, key: "valor", tipo: "num" },
    { header: "Estatus", width: 16, key: "estatus", tipo: "texto" },
    { header: "Fecha de muestreo", width: 19, key: "fecha", tipo: "fecha" },
  ], data.mediciones.map((m) => {
    const mu = muestraById.get(String(m["muestra_id"]));
    return {
      muestra: String(m["muestra_id"] ?? ""),
      rollo: String(mu?.["numero_rollo"] ?? ""),
      producto: productos.get(String(mu?.["producto_id"])) ?? "",
      maquina: maquinas.get(String(mu?.["maquina_id"])) ?? "",
      turno: String(mu?.["turno"] ?? ""),
      variable: String(m["variable_clave"] ?? ""),
      clave: String(m["variable_clave"] ?? ""),
      valor: Number(m["valor"] ?? 0),
      estatus: String(m["estado"] ?? ""),
      fecha: d(mu?.["hora_muestreo"]),
    };
  }));

  // -------------------------- CATALOGOS_UTILIZADOS ------------------------- //
  const catalogos: Record<string, unknown>[] = [
    ...data.bobinadoras.map((b) => ({ tipo: "Bobinadora", id: b["id"], codigo: b["codigo"] ?? "", nombre: b["nombre"] ?? "", extra: b["activo"] ? "activo" : "inactivo" })),
    ...data.operarios.map((o) => ({ tipo: "Conductor/Operador", id: o["id"], codigo: "", nombre: o["nombre"] ?? "", extra: o["puesto"] ?? "" })),
    ...data.productos.map((p) => ({ tipo: "Producto", id: p["id"], codigo: p["codigo"] ?? "", nombre: p["nombre"] ?? "", extra: p["gramaje"] ?? "" })),
    ...data.maquinas.map((m) => ({ tipo: "Máquina", id: m["id"], codigo: m["codigo"] ?? "", nombre: m["nombre"] ?? "", extra: m["area"] ?? "" })),
    ...data.perfiles.map((u) => ({ tipo: "Usuario", id: u["id"], codigo: "", nombre: u["nombre"] ?? "", extra: u["rol_visible"] ?? "" })),
  ];
  hoja(wb, "CATALOGOS_UTILIZADOS", [
    { header: "Tipo", width: 20, key: "tipo", tipo: "texto" },
    { header: "ID", width: 38, key: "id", tipo: "texto" },
    { header: "Código", width: 16, key: "codigo", tipo: "texto" },
    { header: "Nombre", width: 34, key: "nombre", tipo: "texto" },
    { header: "Detalle", width: 22, key: "extra", tipo: "texto" },
  ], catalogos);

  // Solo se entrega la hoja CINTAS: se descartan las demás hojas del libro.
  for (const ws of [...wb.worksheets]) {
    if (ws.name !== "CINTAS") wb.removeWorksheet(ws.id);
  }

  await descargarLibro(wb, fileName);
  return { fileName, lotes: data.lotes.length, cintas: data.cintas.length };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
