import type { ImpBobina } from './functions';
import { IMP_VARIABLES, IMP_ESTADOS, impDateLabel } from './rules';
import { fechaHoraMX } from '@/lib/format';
import logo from '@/assets/logo-convertipap.png';
import { impLabelData } from './label-data';
export async function impExport(rows: ImpBobina[]) {
 const ExcelJS=(await import('exceljs')).default;
 const headers=['Fecha','N.º Rollo','Máquina','Proveedor','Calidad','SKU SAP','Estado','Planta','Turno','Analista','Observaciones',...IMP_VARIABLES.map(v=>v.label),'Fecha/hora captura México','Folio original','Estado original','Fila Excel'];
 const values=rows.map(r=>{const v=r.valores as Record<string,number|null>; return [impDateLabel(r.fecha),r.folio,r.maquina,r.proveedor_nombre,r.producto_codigo,r.sku??'',IMP_ESTADOS[r.estado as keyof typeof IMP_ESTADOS],r.planta_codigo??'',r.turno??'',r.analista??'',r.observaciones??'',...IMP_VARIABLES.map(x=>v[x.key]??''),r.capturado_at?fechaHoraMX(r.capturado_at):'',r.folio_original??'',r.estado_original??'',r.fuente_fila??''];});
 const wb=new ExcelJS.Workbook(); wb.creator='ConvertiPap QMS'; wb.created=new Date();
 const HEAD=6; const ws=wb.addWorksheet('Bobinas Madre Imp',{views:[{state:'frozen',ySplit:HEAD}],pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
 const n=headers.length; headers.forEach((h,i)=>{ws.getColumn(i+1).width=h==='Observaciones'?40:18;});
 try{const res=await fetch(logo);if(res.ok){const id=wb.addImage({buffer:await res.arrayBuffer(),extension:'png'});ws.addImage(id,{tl:{col:0,row:0},ext:{width:150,height:60},editAs:'oneCell'});}}catch{/* sin logo */}
 const line=(r:number,text:string,font:Partial<import('exceljs').Font>)=>{ws.mergeCells(r,3,r,n);const c=ws.getCell(r,3);c.value=text;c.font={name:'Calibri',...font};c.alignment={horizontal:'center',vertical:'middle'};ws.getRow(r).height=22;};
 line(1,'CONVERTIPAP S.A. DE C.V. — PLANTAS TLAXCALA E IXTAPALUCA',{size:14,bold:true});
 line(2,'REPORTE DE BOBINAS MADRE IMP (MP-00)',{size:11,bold:true,color:{argb:'FF333333'}});
 line(3,'ÁREA: CALIDAD',{size:9,italic:true,color:{argb:'FF555555'}});
 ws.mergeCells(5,1,5,n); const f=ws.getCell(5,1); f.value=`FECHA DE GENERACIÓN: ${fechaHoraMX(new Date().toISOString())}   ·   BOBINAS: ${rows.length}`; f.font={name:'Calibri',size:12,bold:true}; f.alignment={horizontal:'center',vertical:'middle'}; f.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE5E7EB'}}; ws.getRow(5).height=22;
 const thin={style:'thin' as const,color:{argb:'FF808080'}}; const border={top:thin,left:thin,bottom:thin,right:thin};
 const hr=ws.getRow(HEAD); headers.forEach((h,i)=>{const c=hr.getCell(i+1);c.value=h;c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF000000'}};c.font={name:'Calibri',size:10,bold:true,color:{argb:'FFFFFFFF'}};c.alignment={horizontal:'center',vertical:'middle',wrapText:true};c.border=border;}); hr.height=30;
 values.forEach((vals,j)=>{const r=ws.getRow(HEAD+1+j);vals.forEach((v,i)=>{const c=r.getCell(i+1);c.value=v as string|number;c.font={name:'Calibri',size:10};c.border=border;});});
 ws.autoFilter={from:{row:HEAD,column:1},to:{row:HEAD+values.length,column:n}};
 const buf=await wb.xlsx.writeBuffer(); const url=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const a=document.createElement('a');a.href=url;a.download='Bobinas_Madre_Imp.xlsx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export async function impPrint(row: ImpBobina) {
 const w=window.open('','_blank'); if(!w) throw new Error('Permita abrir la ventana de impresión.');
 try {
 const { buildImportedLabelHtml } = await import('@/lib/etiqueta-liberacion');
 const { data, context } = impLabelData(row);
 const html = await buildImportedLabelHtml(data, context);
 w.document.open(); w.document.write(html); w.document.close();
 }catch(e){w.close();throw e;}
}
