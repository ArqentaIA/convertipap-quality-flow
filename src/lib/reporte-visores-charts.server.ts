// =============================================================================
// Inyección de gráficas de barras NATIVAS de Excel en el libro generado por
// ExcelJS (que no soporta charts). Se abre el .xlsx como zip y se agregan las
// partes OOXML de chart + drawing, sin tocar datos ni hojas existentes.
// READ ONLY respecto a la base de datos.
// =============================================================================
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

type SerieChart = {
  titulo: string;
  hoja: string;
  catRef: string; // ej. $B$37:$B$41
  valRef: string; // ej. $C$37:$C$41
  color: string; // RRGGBB
  numFmt: string; // ej. "0" | "0.0%"
  /** anclaje: columnas/filas 0-index */
  from: { col: number; row: number };
  to: { col: number; row: number };
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function chartXml(s: SerieChart, puntos: number) {
  const ref = (r: string) => `'${s.hoja}'!${r}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<c:chart>
<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1100" b="1"><a:solidFill><a:srgbClr val="1F2F46"/></a:solidFill><a:latin typeface="Calibri"/></a:defRPr></a:pPr><a:r><a:rPr lang="es-MX" sz="1100" b="1"><a:solidFill><a:srgbClr val="1F2F46"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr><a:t>${esc(s.titulo)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
<c:autoTitleDeleted val="0"/>
<c:plotArea><c:layout/>
<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>
<c:ser><c:idx val="0"/><c:order val="0"/>
<c:tx><c:strRef><c:f>${esc(ref(s.catRef))}</c:f></c:strRef></c:tx>
<c:spPr><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>
<c:dLbls><c:numFmt formatCode="${esc(s.numFmt)}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="1F2F46"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="es-MX"/></a:p></c:txPr><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>
<c:cat><c:strRef><c:f>${esc(ref(s.catRef))}</c:f><c:strCache><c:ptCount val="${puntos}"/></c:strCache></c:strRef></c:cat>
<c:val><c:numRef><c:f>${esc(ref(s.valRef))}</c:f><c:numCache><c:formatCode>${esc(s.numFmt)}</c:formatCode><c:ptCount val="${puntos}"/></c:numCache></c:numRef></c:val>
</c:ser>
<c:gapWidth val="60"/><c:axId val="111111111"/><c:axId val="222222222"/></c:barChart>
<c:catAx><c:axId val="111111111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="5B6573"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="es-MX"/></a:p></c:txPr><c:crossAx val="222222222"/></c:catAx>
<c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="D9E1EA"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="${esc(s.numFmt)}" sourceLinked="0"/><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="5B6573"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="es-MX"/></a:p></c:txPr><c:crossAx val="111111111"/></c:valAx>
<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>
</c:plotArea>
<c:legend><c:legendPos val="b"/><c:overlay val="0"/><c:delete val="1"/></c:legend>
<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>
</c:chart>
<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="D9E1EA"/></a:solidFill></a:ln></c:spPr>
</c:chartSpace>`;
}

function drawingXml(series: SerieChart[]) {
  const anchors = series
    .map(
      (s, i) => `<xdr:twoCellAnchor editAs="oneCell">
<xdr:from><xdr:col>${s.from.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${s.from.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
<xdr:to><xdr:col>${s.to.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${s.to.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Gráfico ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>
<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${i + 1}"/></a:graphicData></a:graphic>
</xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors}</xdr:wsDr>`;
}

/**
 * Inserta gráficas de barras nativas en la hoja indicada (por índice de hoja
 * 1-based, tal como xl/worksheets/sheetN.xml).
 */
export function inyectarGraficasDashboard(
  xlsx: ArrayBuffer | Uint8Array,
  opts: { sheetNumber: number; series: SerieChart[]; puntos: number },
): ArrayBuffer {
  const bytes = xlsx instanceof Uint8Array ? xlsx : new Uint8Array(xlsx);
  const zip = unzipSync(bytes);
  const { sheetNumber, series, puntos } = opts;
  const drawingName = "drawing1.xml";

  series.forEach((s, i) => {
    zip[`xl/charts/chart${i + 1}.xml`] = strToU8(chartXml(s, puntos));
  });
  zip[`xl/drawings/${drawingName}`] = strToU8(drawingXml(series));
  zip[`xl/drawings/_rels/${drawingName}.rels`] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${series
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${i + 1}.xml"/>`,
      )
      .join("")}</Relationships>`,
  );

  // Relación hoja -> drawing
  const relPath = `xl/worksheets/_rels/sheet${sheetNumber}.xml.rels`;
  const existente = zip[relPath] ? strFromU8(zip[relPath]) : null;
  const relDrawing = `<Relationship Id="rIdDrawing1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/${drawingName}"/>`;
  zip[relPath] = strToU8(
    existente
      ? existente.replace("</Relationships>", `${relDrawing}</Relationships>`)
      : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relDrawing}</Relationships>`,
  );

  // <drawing/> al final de la hoja (debe ir después de los demás elementos)
  const sheetPath = `xl/worksheets/sheet${sheetNumber}.xml`;
  const sheetXml = strFromU8(zip[sheetPath]!);
  if (!sheetXml.includes("<drawing ")) {
    zip[sheetPath] = strToU8(sheetXml.replace("</worksheet>", `<drawing r:id="rIdDrawing1"/></worksheet>`));
  }

  // Content types
  const ctPath = "[Content_Types].xml";
  let ct = strFromU8(zip[ctPath]!);
  if (!ct.includes('Extension="xml"')) {
    ct = ct.replace("<Types", "<Types");
  }
  const overrides =
    series
      .map(
        (_, i) =>
          `<Override PartName="/xl/charts/chart${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`,
      )
      .join("") +
    `<Override PartName="/xl/drawings/${drawingName}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`;
  ct = ct.replace("</Types>", `${overrides}</Types>`);
  zip[ctPath] = strToU8(ct);

  const out = zipSync(zip, { level: 6 });
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}
