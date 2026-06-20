// Exportadores XLSX y PDF del reporte NO CONFORME.
import type { NoConformePayload, NoConformeRow } from "./reporte-no-conforme.functions";

const HEADERS = [
  "TURNO",
  "FECHA",
  "CALIDAD",
  "ROLLO",
  "DEFECTO",
  "ESTATUS",
  "HORA",
  "PB",
  "BT (R457)",
  "a*",
  "b*",
  "PESO ROLLO",
  "ANCHO ÚTIL",
  "MÁQUINA",
  "DESTINO",
] as const;

const NA = "Sin medición";
const fmt = (v: number | null | undefined) => (v === null || v === undefined ? NA : v);

function rowToArr(r: NoConformeRow): (string | number)[] {
  return [
    r.turno,
    r.fechaOperativa,
    r.calidad,
    r.rollo,
    r.defecto,
    r.estatus,
    r.hora,
    fmt(r.pb),
    fmt(r.btR457),
    fmt(r.aStar),
    fmt(r.bStar),
    fmt(r.pesoRollo),
    fmt(r.anchoUtil),
    r.maquina,
    r.destino,
  ];
}

function fileBase(payload: NoConformePayload) {
  return `NO_CONFORME_${payload.year}-${String(payload.month).padStart(2, "0")}`;
}

export async function exportReporteNoConformeXLSX(
  payload: NoConformePayload,
  rows: NoConformeRow[],
) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("NO CONFORME");

  // Título
  ws.mergeCells(1, 1, 1, HEADERS.length);
  const title = ws.getCell(1, 1);
  title.value = "SEGUIMIENTO DIARIO A ROLLOS RETENIDOS - PST";
  title.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
  ws.getRow(1).height = 28;

  // Subtítulo periodo
  ws.mergeCells(2, 1, 2, HEADERS.length);
  const sub = ws.getCell(2, 1);
  sub.value = `Periodo: ${payload.rangoInicio}  →  ${payload.rangoFin}  ·  Generado: ${new Date(payload.generadoAt).toLocaleString("es-MX")}`;
  sub.font = { italic: true, size: 10, color: { argb: "FF334155" } };
  sub.alignment = { horizontal: "center" };

  // Headers
  const headerRow = ws.addRow([]);
  headerRow.values = [...HEADERS];
  headerRow.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
    c.border = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });
  ws.getRow(3).height = 30;

  // Datos
  rows.forEach((r) => {
    const row = ws.addRow(rowToArr(r));
    row.eachCell((c, col) => {
      c.alignment = {
        horizontal: col === 5 ? "left" : "center",
        vertical: "middle",
        wrapText: col === 5,
      };
      c.border = {
        top: { style: "hair", color: { argb: "FFE2E8F0" } },
        bottom: { style: "hair", color: { argb: "FFE2E8F0" } },
        left: { style: "hair", color: { argb: "FFE2E8F0" } },
        right: { style: "hair", color: { argb: "FFE2E8F0" } },
      };
    });
    // Colores por estatus
    const colorBg = r.estatus === "NO CONFORME" ? "FFFEE2E2" : "FFFEF9C3";
    const colorTx = r.estatus === "NO CONFORME" ? "FF991B1B" : "FF854D0E";
    const ec = row.getCell(6);
    ec.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colorBg } };
    ec.font = { bold: true, color: { argb: colorTx } };
  });

  const widths = [12, 12, 12, 12, 50, 16, 8, 8, 10, 8, 8, 11, 12, 10, 36];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: "frozen", ySplit: 3 }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileBase(payload)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportReporteNoConformePDF(
  payload: NoConformePayload,
  rows: NoConformeRow[],
) {
  const [{ default: jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = (autoTableMod as { default: (doc: unknown, opts: unknown) => void }).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const M = 28;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("SEGUIMIENTO DIARIO A ROLLOS RETENIDOS - PST", M, M + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(
    `Periodo: ${payload.rangoInicio}  →  ${payload.rangoFin}    Generado: ${new Date(payload.generadoAt).toLocaleString("es-MX")}`,
    M,
    M + 20,
  );

  autoTable(doc, {
    startY: M + 30,
    head: [[...HEADERS]],
    body: rows.map((r) => rowToArr(r).map(String)),
    styles: { fontSize: 7.5, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 4: { cellWidth: 180 } },
    didParseCell: (data: unknown) => {
      const d = data as {
        section: string;
        column: { index: number };
        row: { index: number };
        cell: { styles: Record<string, unknown> };
      };
      if (d.section === "body" && d.column.index === 5) {
        const r = rows[d.row.index];
        if (r?.estatus === "NO CONFORME") {
          d.cell.styles.fillColor = [254, 226, 226];
          d.cell.styles.textColor = [153, 27, 27];
          d.cell.styles.fontStyle = "bold";
        } else if (r?.estatus === "CONDICIONADO") {
          d.cell.styles.fillColor = [254, 249, 195];
          d.cell.styles.textColor = [133, 77, 14];
          d.cell.styles.fontStyle = "bold";
        }
      }
    },
    margin: { left: M, right: M },
  });
  doc.save(`${fileBase(payload)}.pdf`);
}
