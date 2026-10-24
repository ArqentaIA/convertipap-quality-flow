import type { ImpBobina } from './functions';
import { IMP_VARIABLES, IMP_ESTADOS, impDateLabel, impSkuQr } from './rules';
import { fechaHoraMX } from '@/lib/format';
import logo from '@/assets/logo-convertipap.png';
export async function impExport(rows: ImpBobina[]) {
 const XLSX=await import('xlsx');
 const headers=['Fecha','N.º Rollo','Máquina','Proveedor','Calidad','SKU SAP','Estado','Planta','Turno','Analista','Observaciones',...IMP_VARIABLES.map(v=>v.label),'Fecha/hora captura México','Folio original','Estado original','Fila Excel'];
 const values=rows.map(r=>{const v=r.valores as Record<string,number|null>; return [impDateLabel(r.fecha),r.folio,r.maquina,r.proveedor_nombre,r.producto_codigo,r.sku??'',IMP_ESTADOS[r.estado as keyof typeof IMP_ESTADOS],r.planta_codigo??'',r.turno??'',r.analista??'',r.observaciones??'',...IMP_VARIABLES.map(x=>v[x.key]??''),r.capturado_at?fechaHoraMX(r.capturado_at):'',r.folio_original??'',r.estado_original??'',r.fuente_fila??''];});
 const wb=XLSX.utils.book_new(); const summary=XLSX.utils.aoa_to_sheet([['BOBINAS MADRE IMP'],['Máquina','MP-00'],['Bobinas',rows.length],...Object.entries(IMP_ESTADOS).map(([s,l])=>[l,rows.filter(r=>r.estado===s).length])]); XLSX.utils.book_append_sheet(wb,summary,'Resumen');
 const ws=XLSX.utils.aoa_to_sheet([headers,...values]); ws['!cols']=headers.map(()=>({wch:22})); ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:values.length,c:headers.length-1}})}; XLSX.utils.book_append_sheet(wb,ws,'Bobinas Madre Imp'); XLSX.writeFile(wb,'Bobinas_Madre_Imp.xlsx');
}
export async function impPrint(row: ImpBobina) {
 const w=window.open('','_blank'); if(!w) throw new Error('Permita abrir la ventana de impresión.');
 try {
 const QR=await import('qrcode'); const values=row.valores as Record<string,number|null>;
 const pdfModule=await import('jspdf'); const doc=new pdfModule.jsPDF({orientation:'landscape',unit:'mm',format:[210,148]});
 const res=await fetch(logo); const blob=await res.blob(); const logoData=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(blob);});
 doc.addImage(logoData,'PNG',8,7,35,12); doc.setFontSize(16);doc.text('BOBINAS MADRE IMP',60,15); doc.setFontSize(10);doc.text(`MP-00   ${row.folio}   Ver ${row.revision}.0`,60,23);
 let y=35; const lines=[`Proveedor: ${row.proveedor_nombre}`,`Calidad: ${row.producto_codigo}`,`SKU SAP: ${row.sku??'—'}`,`Estado: ${IMP_ESTADOS[row.estado as keyof typeof IMP_ESTADOS]}`,`Fecha: ${impDateLabel(row.fecha)}    Turno: ${row.turno??'—'}    Planta: ${row.planta_codigo??'—'}`,`Analista: ${row.analista??'—'}`];
 for(const l of lines){doc.text(l,8,y);y+=6;}
 for(const v of IMP_VARIABLES){doc.text(`${v.label}: ${values[v.key]??'—'}`,8,y);y+=6;}
 const obs=doc.splitTextToSize(`Observaciones: ${row.observaciones??'—'}`,185);doc.text(obs.slice(0,2),8,118);
 const payloads=[['Trazabilidad',`https://www.convertipap.site/bobinas-madre-imp?bobina=${row.id}`],['Rollo',row.folio],['SKU SAP',impSkuQr(row.sku)]];
 for(let i=0;i<payloads.length;i++){const [label,payload]=payloads[i]; const x=112+(i%2)*43; const top=i===2?76:34;doc.setFontSize(8);doc.text(label,x,top);if(payload) doc.addImage(await QR.toDataURL(payload),'PNG',x,top+2,29,29);else doc.text('Sin SKU',x,top+8);}
 const url=URL.createObjectURL(doc.output('blob')); w.location.href=url;setTimeout(()=>URL.revokeObjectURL(url),120000);
 }catch(e){w.close();throw e;}
}
