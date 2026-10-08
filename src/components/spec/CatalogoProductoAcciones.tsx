// Botones Editar producto / Agregar producto / Eliminar producto del
// Catálogo Maestro de Especificaciones. Toda regla se valida en servidor.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, PackagePlus, PencilLine, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  puedeGestionarCatalogo,
  datosFormularioCatalogo,
  editarProductoCatalogo,
  crearProductoCatalogo,
  eliminarProductoCatalogo,
} from "@/lib/catalogo-calidad.functions";

type Props = {
  codigo: string | undefined;
  nombre: string | undefined;
  versionVigente: string | null | undefined;
  versionBorrador: string | null | undefined;
  onCambio: (codigoNuevo?: string) => void | Promise<void>;
};

const lbl = "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";

export function CatalogoProductoAcciones({ codigo, nombre, versionVigente, versionBorrador, onCambio }: Props) {
  const permisoFn = useServerFn(puedeGestionarCatalogo);
  const { data: permiso } = useQuery({
    queryKey: ["catalogo-calidad-permiso"],
    queryFn: () => permisoFn(),
    staleTime: 60_000,
  });
  const [modal, setModal] = useState<"editar" | "agregar" | "eliminar" | null>(null);
  if (!permiso?.puede) return null;

  return (
    <>
      <Button size="sm" variant="outline" disabled={!codigo} onClick={() => setModal("editar")}>
        <PencilLine className="h-4 w-4" /> Editar
      </Button>
      <Button size="sm" variant="outline" onClick={() => setModal("agregar")}>
        <PackagePlus className="h-4 w-4" /> Agregar
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!codigo}
        className="border-destructive/40 text-destructive hover:bg-destructive/10"
        onClick={() => setModal("eliminar")}
      >
        <Trash2 className="h-4 w-4" /> Eliminar
      </Button>

      {modal === "editar" && codigo && (
        <EditarDialog
          codigo={codigo}
          nombre={nombre ?? ""}
          versionActual={versionBorrador ?? versionVigente ?? ""}
          tieneBorrador={!!versionBorrador}
          onClose={() => setModal(null)}
          onCambio={onCambio}
        />
      )}
      {modal === "agregar" && <AgregarDialog onClose={() => setModal(null)} onCambio={onCambio} />}
      {modal === "eliminar" && codigo && (
        <EliminarDialog codigo={codigo} nombre={nombre ?? ""} onClose={() => setModal(null)} onCambio={onCambio} />
      )}
    </>
  );
}

function EditarDialog({
  codigo, nombre, versionActual, tieneBorrador, onClose, onCambio,
}: {
  codigo: string; nombre: string; versionActual: string; tieneBorrador: boolean;
  onClose: () => void; onCambio: Props["onCambio"];
}) {
  const datosFn = useServerFn(datosFormularioCatalogo);
  const editarFn = useServerFn(editarProductoCatalogo);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["catalogo-calidad-form", codigo],
    queryFn: () => datosFn({ data: { codigo } }),
  });
  const [version, setVersion] = useState(versionActual);
  const [sku, setSku] = useState("");
  const [desc, setDesc] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (motivo.trim().length < 10) return toast.error("Motivo obligatorio (mínimo 10 caracteres).");
    const cambiaVersion = version.trim() !== "" && version.trim() !== versionActual;
    if (!cambiaVersion && !sku.trim()) return toast.info("No hay cambios que guardar.");
    setGuardando(true);
    try {
      const res = await editarFn({
        data: {
          codigo,
          ...(cambiaVersion ? { version: version.trim() } : {}),
          ...(sku.trim() ? { sku: sku.trim(), descripcion_sku: desc.trim() } : {}),
          motivo: motivo.trim(),
        },
      });
      if (res.cambios === 0) toast.info("Sin cambios que aplicar.");
      else toast.success("Producto actualizado. La versión queda en borrador hasta publicarse.");
      void qc.invalidateQueries({ queryKey: ["catalogo-calidad-form", codigo] });
      await onCambio();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar producto · {codigo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="text-xs text-muted-foreground">{nombre}</div>
          <div>
            <div className={lbl}>Versión {tieneBorrador ? "del borrador" : "(se creará un borrador)"}</div>
            <Input value={version} maxLength={20} onChange={(e) => setVersion(e.target.value)} className="mt-1" placeholder="Ej. 2.0" />
            <p className="mt-1 text-[11px] text-muted-foreground">
              La versión vigente no se modifica: el cambio aplica al borrador y entra en producción al publicarse.
            </p>
          </div>
          <div>
            <div className={lbl}>SKU SAP asignados</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {(data?.skus ?? []).length === 0 && <span className="text-xs text-muted-foreground">Sin SKU asignado</span>}
              {(data?.skus ?? []).map((s) => (
                <span key={s} className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] tabular-nums">{s}</span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className={lbl}>Asignar SKU SAP</div>
              <Input value={sku} maxLength={64} onChange={(e) => setSku(e.target.value)} className="mt-1" placeholder="Ej. SSC101101232" />
            </div>
            <div>
              <div className={lbl}>Descripción SAP (opcional)</div>
              <Input value={desc} maxLength={200} onChange={(e) => setDesc(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <div className={lbl}>Motivo (obligatorio, mínimo 10 caracteres)</div>
            <Textarea value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} rows={2} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type FilaVar = { sel: boolean; min: string; obj: string; max: string };

function AgregarDialog({ onClose, onCambio }: { onClose: () => void; onCambio: Props["onCambio"] }) {
  const datosFn = useServerFn(datosFormularioCatalogo);
  const crearFn = useServerFn(crearProductoCatalogo);
  const { data, isLoading } = useQuery({
    queryKey: ["catalogo-calidad-form", "_nuevo"],
    queryFn: () => datosFn({ data: {} }),
  });
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("");
  const [version, setVersion] = useState("1.0");
  const [sku, setSku] = useState("");
  const [motivo, setMotivo] = useState("");
  const [filas, setFilas] = useState<Record<string, FilaVar>>({});
  const [guardando, setGuardando] = useState(false);

  const vars = useMemo(() => data?.variables ?? [], [data]);
  const fila = (id: string): FilaVar => {
    if (filas[id]) return filas[id];
    const v = vars.find((x) => x.id === id);
    const s = (n: number | null | undefined) => (n == null ? "" : String(n));
    return { sel: false, min: s(v?.min_default), obj: s(v?.objetivo_default), max: s(v?.max_default) };
  };
  const setFila = (id: string, p: Partial<FilaVar>) => setFilas((f) => ({ ...f, [id]: { ...fila(id), ...p } }));
  const seleccionadas = vars.filter((v) => fila(v.id).sel);

  const guardar = async () => {
    if (!codigo.trim() || !nombre.trim() || !tipo) return toast.error("Código, nombre y familia son obligatorios.");
    if (seleccionadas.length === 0) return toast.error("Selecciona al menos una variable.");
    if (motivo.trim().length < 10) return toast.error("Motivo obligatorio (mínimo 10 caracteres).");
    const variables = [];
    for (const v of seleccionadas) {
      const f = fila(v.id);
      const min = Number(f.min), obj = Number(f.obj), max = Number(f.max);
      if ([f.min, f.obj, f.max].some((x) => x.trim() === "") || ![min, obj, max].every(Number.isFinite))
        return toast.error(`${v.etiqueta}: captura mínimo, objetivo y máximo.`);
      if (!(min <= obj && obj <= max)) return toast.error(`${v.etiqueta}: debe cumplirse mínimo ≤ objetivo ≤ máximo.`);
      variables.push({ variable_id: v.id, min, objetivo: obj, max });
    }
    setGuardando(true);
    try {
      await crearFn({
        data: {
          codigo: codigo.trim().toUpperCase(),
          nombre: nombre.trim(),
          tipo_id: tipo,
          version: version.trim() || "1.0",
          ...(sku.trim() ? { sku: sku.trim() } : {}),
          variables,
          motivo: motivo.trim(),
        },
      });
      toast.success("Producto creado en borrador. Publícalo para habilitarlo en captura.");
      await onCambio(codigo.trim().toUpperCase());
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Agregar producto</DialogTitle>
        </DialogHeader>
        <div className="flex-1 space-y-3 overflow-auto text-sm">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <div>
              <div className={lbl}>Código</div>
              <Input value={codigo} maxLength={30} onChange={(e) => setCodigo(e.target.value.toUpperCase())} className="mt-1" placeholder="Ej. PSC02" />
            </div>
            <div className="col-span-2">
              <div className={lbl}>Nombre</div>
              <Input value={nombre} maxLength={200} onChange={(e) => setNombre(e.target.value)} className="mt-1" />
            </div>
            <div>
              <div className={lbl}>Versión</div>
              <Input value={version} maxLength={20} onChange={(e) => setVersion(e.target.value)} className="mt-1" />
            </div>
            <div>
              <div className={lbl}>SKU SAP (opcional)</div>
              <Input value={sku} maxLength={64} onChange={(e) => setSku(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <div className={lbl}>Familia / tipo</div>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Selecciona…</option>
              {(data?.tipos ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <div className={lbl}>Variables del producto (marca solo las que apliquen)</div>
            {isLoading ? (
              <div className="py-4 text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Cargando…</div>
            ) : (
              <div className="mt-1 overflow-x-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5"></th>
                      <th className="px-2 py-1.5">Variable</th>
                      <th className="px-2 py-1.5">Unidad</th>
                      <th className="px-2 py-1.5 text-right">Mínimo</th>
                      <th className="px-2 py-1.5 text-right">Objetivo</th>
                      <th className="px-2 py-1.5 text-right">Máximo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vars.map((v) => {
                      const f = fila(v.id);
                      return (
                        <tr key={v.id} className={`border-t border-border ${f.sel ? "bg-primary/5" : ""}`}>
                          <td className="px-2 py-1">
                            <input type="checkbox" checked={f.sel} onChange={(e) => setFila(v.id, { sel: e.target.checked })} />
                          </td>
                          <td className="px-2 py-1 font-medium">{v.etiqueta}</td>
                          <td className="px-2 py-1 text-muted-foreground">{v.unidad || "—"}</td>
                          {(["min", "obj", "max"] as const).map((k) => (
                            <td key={k} className="px-2 py-1 text-right">
                              <Input
                                type="number"
                                step="any"
                                disabled={!f.sel}
                                value={f[k]}
                                onChange={(e) => setFila(v.id, { [k]: e.target.value })}
                                className="ml-auto h-7 w-24 text-right text-xs"
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">{seleccionadas.length} variable(s) seleccionada(s).</p>
          </div>
          <div>
            <div className={lbl}>Motivo (obligatorio, mínimo 10 caracteres)</div>
            <Textarea value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} rows={2} className="mt-1" />
          </div>
          <p className="text-[11px] text-muted-foreground">
            El producto se crea en borrador; se habilita en captura al enviarlo a revisión y publicarlo (con evidencia si aplica).
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Crear producto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EliminarDialog({
  codigo, nombre, onClose, onCambio,
}: { codigo: string; nombre: string; onClose: () => void; onCambio: Props["onCambio"] }) {
  const elimFn = useServerFn(eliminarProductoCatalogo);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const eliminar = async () => {
    if (motivo.trim().length < 10) return toast.error("Motivo obligatorio (mínimo 10 caracteres).");
    setGuardando(true);
    try {
      await elimFn({ data: { codigo, motivo: motivo.trim() } });
      toast.success(`Producto ${codigo} eliminado del catálogo.`);
      await onCambio("");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminar producto · {codigo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            <strong>{nombre}</strong> dejará de aparecer en el catálogo y en captura a partir de ahora.
            Los rollos ya capturados conservan su producto y su historial sin cambios.
          </p>
          <div>
            <div className={lbl}>Motivo (obligatorio, mínimo 10 caracteres)</div>
            <Textarea value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} rows={2} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button variant="destructive" onClick={eliminar} disabled={guardando}>
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
