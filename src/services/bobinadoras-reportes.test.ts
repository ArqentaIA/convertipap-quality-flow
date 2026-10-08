import { afterEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { normalizarLotes } from "./cintas-plantilla-base";
import { generarReporteDiarioCintas } from "./reporteDiarioBobinadorasCintas";
import { generarReporteMejoradoCintas } from "./reporteMejoradoBobinadorasCintas";
import { generarReporteMensualBobinadoras } from "./reporteMensualBobinadorasExcel";
import type { DatosReporteCintas } from "@/lib/reportes-cintas.functions";
import type { ReporteMensualCintasData } from "@/lib/pesaje-cintas.functions";

function fixture(position: number) {
  const lote = {
    id: "lote", numero_rollo: "PRUEBA-4", fabricacion: "PRUEBA", producto_codigo: "PSC01",
    producto_nombre: "Servilleta", conductor_nombre_snapshot: "Prueba", bobinadora_nombre_snapshot: "B1",
    peso_bobina_madre_neto_kg: 1000, estado: "finalizado", es_manual: false,
    peso_mermas_kg: 750, fecha_produccion: "2026-09-06", datos_calidad_snapshot: { turno: "1" },
  };
  const cintas = [1, position].map((posicion, index) => ({
    id: `cinta-${index}`, lote_id: "lote", posicion, peso_cinta_kg: 125, ancho_util: 20,
    uniones: 0, estado: "registrada", lote_logistico_pza: index === 0 ? "1234567890" : null,
    created_at: "2026-09-06T14:00:00Z", observaciones: null,
  }));
  const common = { planta: "TLX", usuario: "Prueba", generadoAt: "2026-09-06T14:00:00Z", lotes: [lote], cintas };
  return {
    diario: { ...common, fechaInicio: "2026-09-06", fechaFin: "2026-09-06", turno: "" } as unknown as DatosReporteCintas,
    mensual: { ...common, year: 2026, month: 9, rangoInicio: "2026-09-01", rangoFinExclusivo: "2026-10-01", snapshots: { lote: lote.datos_calidad_snapshot } } as unknown as ReporteMensualCintasData,
  };
}

async function captureDownload(run: () => Promise<unknown>, file: string) {
  let saved: Blob | undefined;
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => { saved = blob as Blob; return "blob:test"; });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.stubGlobal("document", { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } });
  vi.stubGlobal("fetch", async (url: string) => {
    if (!url.startsWith("/plantillas/")) return new Response(null, { status: 404 });
    return new Response(await readFile(`public${url}`));
  });
  await run();
  if (!saved) throw new Error("No se generó el archivo");
  const buffer = await saved.arrayBuffer();
  await mkdir("/tmp/bobinadoras-tests", { recursive: true });
  await writeFile(`/tmp/bobinadoras-tests/${file}`, Buffer.from(buffer));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Reportes completos de bobinadoras", () => {
  it("acepta C350 y rechaza posiciones fuera del rango sin recortar", () => {
    expect(normalizarLotes(fixture(350).diario)[0]?.activas.map(c => c.posicion)).toEqual([1, 350]);
    expect(() => normalizarLotes(fixture(351).diario)).toThrow("Posición inválida");
    expect(() => normalizarLotes(fixture(1.5).diario)).toThrow("Posición inválida");
  });
  it("diario incluye C350, conserva totales y área de impresión", async () => {
    const wb = await captureDownload(() => generarReporteDiarioCintas(fixture(350).diario, "diario.xlsx"), "diario.xlsx");
    const ws = wb.worksheets[0];
    expect(ws?.getCell(9, 353).value).toBe("Medida 350\nPeso");
    expect(ws?.getCell(10, 353).value).toContain("125 kg");
    expect(ws?.getCell("P37").value).toBe(250);
    expect(ws?.pageSetup.printArea).toContain("MO");
  });
  it("mejorado incluye C350 y no recorta pesos", async () => {
    const wb = await captureDownload(() => generarReporteMejoradoCintas(fixture(350).diario, "mejorado.xlsx"), "mejorado.xlsx");
    expect(wb.worksheets[0]?.getCell(10, 353).value).toContain("Cinta 350");
    expect(wb.worksheets[0]?.getCell(11, 353).value).toBe(125);
  });
  it.each([5, 25, 350])("mensual conserva mínimo 20 columnas y pesos numéricos con SAP (C%s)", async position => {
    const wb = await captureDownload(() => generarReporteMensualBobinadoras(fixture(position).mensual), `mensual-${position}.xlsx`);
    const ws = wb.worksheets[1];
    expect(ws?.getCell(6, Math.max(20, position) + 3).value).toContain(`P${String(Math.max(20, position)).padStart(2, "0")}`);
    expect(ws?.getCell("D9").value).toBe(125);
    expect(ws?.getCell("D9").numFmt).toContain("1234567890");
    expect(ws?.getCell(9, position + 3).value).toBe(125);
    const totals: Record<string, unknown> = {};
    ws?.eachRow(row => { if (typeof row.getCell(1).value === "string") totals[String(row.getCell(1).value)] = row.getCell(4).value; });
    expect(totals["Producción acumulada (kg)"]).toBe(250);
    expect(totals["Subtotal posiciones 1–5 (kg)"]).toMatchObject({ result: position === 5 ? 250 : 125 });
    if (position > 20) expect(totals[`Subtotal posiciones ${position - 4}–${position} (kg)`]).toMatchObject({ result: 125 });
  });
});