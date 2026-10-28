import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useNavigate } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { impBuscarFolio } from '@/lib/bobinas-imp/functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export function ImportedRollSearch(){
 const [folio,setFolio]=useState('');const [busy,setBusy]=useState(false);const lookup=useServerFn(impBuscarFolio);const navigate=useNavigate();
 async function search(){setBusy(true);try{const row=await lookup({data:{folio}});if(!row){toast.error('Bobina importada no encontrada. Use el folio con -0.');return;}await navigate({to:'/bobinas-madre-imp',search:{bobina:row.id}});}catch{toast.error('No se pudo consultar la bobina importada.');}finally{setBusy(false);}}
 return <form className="hidden items-center gap-1 xl:flex" onSubmit={e=>{e.preventDefault();void search();}}><Input className="w-36" aria-label="Consultar bobina importada" placeholder="Rollo Imp · -0" value={folio} onChange={e=>setFolio(e.target.value)}/><Button type="submit" size="icon" variant="outline" title="Consultar bobina importada" disabled={busy||!folio.trim()}><Search/></Button></form>;
}