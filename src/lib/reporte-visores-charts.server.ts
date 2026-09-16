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
<c:tx><c:v>${esc(s.titulo)}</c:v></c:tx>
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

function anchorsXml(series: SerieChart[], relIds: string[], idBase: number) {
  return series
    .map(
      (s, i) => `<xdr:twoCellAnchor editAs="oneCell">
<xdr:from><xdr:col>${s.from.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${s.from.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
<xdr:to><xdr:col>${s.to.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${s.to.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${idBase + i}" name="Gráfico ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>
<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${relIds[i]}"/></a:graphicData></a:graphic>
</xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`,
    )
    .join("");
}

function drawingXml(inner: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${inner}</xdr:wsDr>`;
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

  // Nombres de parte libres (no pisar charts/drawings existentes de ExcelJS).
  const libre = (plantilla: (n: number) => string) => {
    let n = 1;
    while (zip[plantilla(n)]) n++;
    return n;
  };
  const chartPaths = series.map((s, i) => {
    const n = libre((k) => `xl/charts/chart${k}.xml`) + i;
    const path = `xl/charts/chart${n}.xml`;
    zip[path] = strToU8(chartXml(s, puntos));
    return path;
  });

  const sheetPath = `xl/worksheets/sheet${sheetNumber}.xml`;
  const relPath = `xl/worksheets/_rels/sheet${sheetNumber}.xml.rels`;
  const sheetRels = zip[relPath] ? strFromU8(zip[relPath]) : null;

  // ¿La hoja ya tiene un drawing (p. ej. el logotipo)? Si sí, se reutiliza.
  const drawingRel = sheetRels?.match(
    /<Relationship[^>]*Type="[^"]*\/drawing"[^>]*Target="([^"]+)"[^>]*Id="([^"]+)"|<Relationship[^>]*Id="([^"]+)"[^>]*Type="[^"]*\/drawing"[^>]*Target="([^"]+)"/,
  );
  const targetExistente = drawingRel ? (drawingRel[1] ?? drawingRel[4]) : null;
  const drawingPath = targetExistente
    ? `xl/${targetExistente.replace(/^\.\.\//, "")}`
    : `xl/drawings/drawing${libre((k) => `xl/drawings/drawing${k}.xml`)}.xml`;
  const drawingFile = drawingPath.split("/").pop()!;
  const drawingRelsPath = `xl/drawings/_rels/${drawingFile}.rels`;

  // Relaciones del drawing: se conservan las existentes (imágenes).
  let drawingRels = zip[drawingRelsPath]
    ? strFromU8(zip[drawingRelsPath])
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
  const usados = [...drawingRels.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
  let siguiente = (usados.length ? Math.max(...usados) : 0) + 1;
  const relIds = chartPaths.map(() => `rId${siguiente++}`);
  drawingRels = drawingRels.replace(
    "</Relationships>",
    chartPaths
      .map((p, i) => `<Relationship Id="${relIds[i]}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../${p.replace("xl/", "")}"/>`)
      .join("") + "</Relationships>",
  );
  zip[drawingRelsPath] = strToU8(drawingRels);

  // Anclajes: se agregan al drawing existente o se crea uno nuevo.
  const anchors = anchorsXml(series, relIds, 1000);
  const previo = zip[drawingPath] ? strFromU8(zip[drawingPath]) : null;
  zip[drawingPath] = strToU8(
    previo ? previo.replace("</xdr:wsDr>", `${anchors}</xdr:wsDr>`) : drawingXml(anchors),
  );

  // Relación hoja -> drawing y elemento <drawing/> (solo si no existía).
  if (!targetExistente) {
    const relDrawing = `<Relationship Id="rIdDrawing1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/${drawingFile}"/>`;
    zip[relPath] = strToU8(
      sheetRels
        ? sheetRels.replace("</Relationships>", `${relDrawing}</Relationships>`)
        : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relDrawing}</Relationships>`,
    );
    const sheetXml = strFromU8(zip[sheetPath]!);
    if (!sheetXml.includes("<drawing ")) {
      zip[sheetPath] = strToU8(sheetXml.replace("</worksheet>", `<drawing r:id="rIdDrawing1"/></worksheet>`));
    }
  }

  // Content types
  const ctPath = "[Content_Types].xml";
  let ct = strFromU8(zip[ctPath]!);
  const overrides =
    chartPaths
      .map((p) => `<Override PartName="/${p}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`)
      .join("") +
    (ct.includes(`PartName="/${drawingPath}"`)
      ? ""
      : `<Override PartName="/${drawingPath}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
  ct = ct.replace("</Types>", `${overrides}</Types>`);
  zip[ctPath] = strToU8(ct);

  const out = zipSync(zip, { level: 6 });
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}
