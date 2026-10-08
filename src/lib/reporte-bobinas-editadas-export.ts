import type { ReporteBobinasEditadas } from "./reporte-bobinas-editadas.functions";

/** XLSX del reporte: hoja "Resumen" + hoja "Detalle" (una fila por campo). */
export async function exportReporteBobinasEditadas(data: ReporteBobinasEditadas) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  // ── Hoja Resumen ────────────────────────────────────────────────
  const resumenRows: (string | number)[][] = [
    ["REPORTE DE BOBINAS EDITADAS"],
    ["Periodo", data.periodo],
    ["Inicio (inclusivo)", data.inicioMX],
    ["Cierre T3 (exclusivo)", data.finMX],
    ["Zona horaria", data.zonaHoraria],
    ["Estado", data.enCurso ? "Periodo en curso" : "Periodo cerrado"],
    [],
    ["Bobinas distintas editadas", data.resumen.bobinasDistintas],
    ["Eventos de edición", data.resumen.eventos],
    [],
    ["Desglose por máquina"],
    ["Máquina", "Bobinas editadas", "Eventos"],
    ...data.resumen.porMaquina.map((p) => [p.maquina, p.bobinas, p.eventos]),
  ];
  const wsRes = XLSX.utils.aoa_to_sheet(resumenRows);
  wsRes["!cols"] = [{ wch: 28 }, { wch: 22 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsRes, "Resumen");

  // ── Hoja Detalle (una fila por campo modificado) ────────────────
  const headers = [
    "ID Evento",
    "Fecha/Hora edición",
    "Día operativo",
    "N.º Rollo",
    "Planta",
    "Máquina",
    "Fecha producción",
    "Turno producción",
    "Usuario",
    "Motivo",
    "Campo",
    "Valor anterior",
    "Valor nuevo",
  ];
  const detalle: (string | number)[][] = data.eventos.flatMap((e) =>
    e.campos.map((c) => [
      e.eventoId,
      e.editadoMX,
      e.diaOperativo,
      e.folio,
      e.planta,
      e.maquina,
      e.fechaProduccion,
      e.turnoProduccion,
      e.usuario,
      e.motivo,
      c.campo,
      c.valorAnterior,
      c.valorNuevo,
    ]),
  );
  const wsDet = XLSX.utils.aoa_to_sheet([headers, ...detalle]);
  wsDet["!cols"] = headers.map((h) => ({
    wch: h === "Motivo" ? 45 : h === "ID Evento" ? 38 : 20,
  }));
  wsDet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: detalle.length, c: headers.length - 1 },
    }),
  };
  XLSX.utils.book_append_sheet(wb, wsDet, "Detalle");

  XLSX.writeFile(wb, `Bobinas_editadas_${data.periodo}.xlsx`);
}
