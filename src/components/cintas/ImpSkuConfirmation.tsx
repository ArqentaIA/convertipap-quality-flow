import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from '@/components/ui/alert-dialog';
import { impSkuPendientes } from '@/lib/bobinas-imp/functions';

export function useImpSkuConfirmation() {
 const preview=useServerFn(impSkuPendientes);
 const [pending,setPending]=useState<{codigo:string;sku:string;cantidad:number;esperado:string;save:(token:string)=>Promise<void>}|null>(null);
 const [busy,setBusy]=useState(false);
 async function request(producto_id:string,codigo:string,sku:string,save:(token:string)=>Promise<void>){
  setBusy(true);try{const p=await preview({data:{producto_id}});setPending({...p,codigo,sku:sku.trim(),save});}catch(e){toast.error(e instanceof Error?e.message:'No se pudo consultar el total de rollos.');}finally{setBusy(false);}
 }
 async function confirm(){if(!pending||busy)return;setBusy(true);try{await pending.save(pending.esperado);setPending(null);}catch(e){setPending(null);toast.error(e instanceof Error?e.message:'No se aplicó el SKU.');}finally{setBusy(false);}}
 const dialog=<AlertDialog open={Boolean(pending)} onOpenChange={open=>{if(!open&&!busy)setPending(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar asignación de SKU</AlertDialogTitle><AlertDialogDescription>Se aplicará el SKU <strong>{pending?.sku}</strong> a <strong>{pending?.cantidad} rollos sin SKU</strong> del producto <strong>{pending?.codigo}</strong>, entre Tlaxcala e Ixtapaluca. Las claves existentes y los demás datos se conservarán. Cada asignación quedará en la bitácora.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><Button variant="outline" disabled={busy} onClick={()=>setPending(null)}>Cancelar</Button><Button disabled={busy} onClick={()=>void confirm()}>{busy?'Guardando…':'Confirmar y aplicar SKU'}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>;
 return {request,busy,dialog};
}