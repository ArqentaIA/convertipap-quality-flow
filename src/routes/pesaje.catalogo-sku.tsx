import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Power, Search, ShieldAlert } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  obtenerCatalogoSkuCintas, guardarSkuCinta, cambiarActivoSkuCinta, type SkuCintaRow,
} from "@/lib/sku-cintas.functions";

export const Route = createFileRoute("/pesaje/catalogo-sku")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Catálogo SKU Cintas · Convertipap" },
      { name: "description", content: "Alta, edición y desactivación de SKU SAP de cintas por planta" },
      { property: "og:title", content: "Catálogo SKU Cintas · Convertipap" },
      { property: "og:description", content: "Alta, edición y desactivación de SKU SAP de cintas por planta" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppLayout title="Catálogo SKU Cintas">
      <CatalogoSkuPage />
    </AppLayout>
  ),
});

const PLANTA_LABEL: Record<string, string> = { TLX: "Tlaxcala", IXT: "Ixtapaluca" };

type Form = {
  id: string | null; clave: string; descripcion: string; producto: string; ancho: string; planta: "" | "TLX" | "IXT"; motivo: string;
};

function CatalogoSkuPage() {
  const obtener = useServerFn(obtenerCatalogoSkuCintas);
  const guardar = useServerFn(guardarSkuCinta);
  const cambiar = useServerFn(cambiarActivoSkuCinta);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["catalogo-sku-cintas"], queryFn: () => obtener() });

  const [buscar, setBuscar] = useState("");
  const [filtro, setFiltro] = useState<"activos" | "inactivos" | "todos">("activos");
  const [form, setForm] = useState<Form | null>(null);
  const [baja, setBaja] = useState<{ row: SkuCintaRow; motivo: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const gestion = q.data?.gestion ?? null;
  const esAdmin = gestion === "ALL";
  const puedeModificar = (r: SkuCintaRow) => esAdmin || r.planta_codigo === gestion;

  const items = useMemo(() => {
    const t = buscar.trim().toUpperCase();
    return (q.data?.items ?? []).filter((r) =>
      (filtro === "todos" || (filtro === "activos" ? r.activo : !r.activo)) &&
      (!t || r.clave.includes(t) || r.descripcion.toUpperCase().includes(t) || r.producto_codigo.toUpperCase().includes(t)),
    );
  }, [q.data, buscar, filtro]);

  function refrescar() {
    void qc.invalidateQueries({ queryKey: ["catalogo-sku-cintas"] });
    void qc.invalidateQueries({ queryKey: ["skus-cintas"] });
  }

  async function onGuardar() {
    if (!form) return;
    const ancho = Number(form.ancho);
    if (!/^[A-Za-z0-9-]{4,30}$/.test(form.clave.trim())) return void toast.error("SKU inválido: 4 a 30 caracteres, sin espacios.");
    if (form.descripcion.trim().length < 3) return void toast.error("Descripción obligatoria.");
    if (!form.producto) return void toast.error("Seleccione el producto.");
    if (!(ancho > 0)) return void toast.error("Ancho de corte inválido.");
    if (form.motivo.trim().length < 10) return void toast.error("Motivo obligatorio (mínimo 10 caracteres).");
    setSaving(true);
    try {
      await guardar({ data: {
        id: form.id, clave: form.clave.trim().toUpperCase(), descripcion: form.descripcion.trim(), producto_codigo: form.producto,
        ancho_corte_cm: ancho, planta_codigo: esAdmin ? (form.planta || null) : null, motivo: form.motivo.trim(),
      } });
      toast.success(form.id ? "SKU actualizado." : "SKU dado de alta.");
      setForm(null);
      refrescar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar.");
    } finally { setSaving(false); }
  }

  async function onCambiarActivo() {
    if (!baja) return;
    if (baja.motivo.trim().length < 10) return void toast.error("Motivo obligatorio (mínimo 10 caracteres).");
    setSaving(true);
    try {
      await cambiar({ data: { id: baja.row.id, activo: !baja.row.activo, motivo: baja.motivo.trim() } });
      toast.success(baja.row.activo ? "SKU desactivado." : "SKU reactivado.");
      setBaja(null);
      refrescar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error.");
    } finally { setSaving(false); }
  }

  if (q.isLoading) {
    return <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>;
  }
  if (q.isError) {
    return <div className="p-8 text-sm text-destructive">No fue posible cargar el catálogo: {(q.error as Error).message}</div>;
  }
  if (!gestion) {
    return (
      <div className="m-6 flex items-center gap-2 rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        <ShieldAlert className="h-5 w-5 text-warning" /> No tiene autorización para administrar el catálogo SKU de cintas.
      </div>
    );
  }

  const inp = "h-9 w-full rounded-md border bg-background px-3 text-sm";

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-primary">Catálogo SKU SAP de cintas</div>
          <div className="text-xs text-muted-foreground">
            {esAdmin ? "Ambas plantas" : `Planta ${PLANTA_LABEL[gestion]}`} · {items.length} SKU
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="SKU, descripción o producto…"
              className="h-9 w-64 rounded-md border bg-background pl-8 pr-3 text-sm" />
          </div>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="activos">Activos</option><option value="inactivos">Inactivos</option><option value="todos">Todos</option>
          </select>
          <button type="button"
            onClick={() => setForm({ id: null, clave: "", descripcion: "", producto: "", ancho: "", planta: esAdmin ? "" : (gestion as "TLX" | "IXT"), motivo: "" })}
            className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
            <Plus className="h-4 w-4" /> Agregar SKU
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">SKU SAP</th>
              <th className="px-3 py-2 text-left">Descripción</th>
              <th className="px-3 py-2 text-left">Producto</th>
              <th className="px-3 py-2 text-right">Ancho de corte (cm)</th>
              <th className="px-3 py-2 text-left">Planta</th>
              <th className="px-3 py-2 text-left">Estado</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2 font-mono text-xs">{r.clave}</td>
                <td className="px-3 py-2">{r.descripcion}</td>
                <td className="px-3 py-2">{r.producto_codigo}</td>
                <td className="px-3 py-2 text-right">{r.ancho_corte_cm ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.planta_codigo ? PLANTA_LABEL[r.planta_codigo] : "Ambas"}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${r.activo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                    {r.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {puedeModificar(r) ? (
                    <>
                      <button type="button" title="Editar"
                        onClick={() => setForm({ id: r.id, clave: r.clave, descripcion: r.descripcion, producto: r.producto_codigo, ancho: r.ancho_corte_cm != null ? String(r.ancho_corte_cm) : "", planta: (r.planta_codigo ?? "") as Form["planta"], motivo: "" })}
                        className="mr-1 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </button>
                      <button type="button" onClick={() => setBaja({ row: r, motivo: "" })}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
                        <Power className="h-3.5 w-3.5" /> {r.activo ? "Desactivar" : "Reactivar"}
                      </button>
                    </>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Compartido · solo administrador</span>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Sin SKU para mostrar.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{form?.id ? "Editar SKU" : "Agregar SKU"}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <Campo label="SKU SAP *"><input className={`${inp} font-mono`} value={form.clave} maxLength={30} onChange={(e) => setForm({ ...form, clave: e.target.value.toUpperCase().replace(/\s/g, "") })} /></Campo>
              <Campo label="Descripción *"><input className={inp} value={form.descripcion} maxLength={200} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Producto *">
                  <select className={inp} value={form.producto} onChange={(e) => setForm({ ...form, producto: e.target.value })}>
                    <option value="">Seleccione…</option>
                    {form.producto && !(q.data?.productos ?? []).includes(form.producto) && <option value={form.producto}>{form.producto}</option>}
                    {(q.data?.productos ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Campo>
                <Campo label="Ancho de corte (cm) *"><input className={inp} type="number" step="0.1" min="0" value={form.ancho} onChange={(e) => setForm({ ...form, ancho: e.target.value })} /></Campo>
              </div>
              <Campo label="Planta">
                {esAdmin ? (
                  <select className={inp} value={form.planta} onChange={(e) => setForm({ ...form, planta: e.target.value as Form["planta"] })}>
                    <option value="">Ambas plantas</option><option value="TLX">Tlaxcala</option><option value="IXT">Ixtapaluca</option>
                  </select>
                ) : (
                  <div className="h-9 rounded-md border bg-muted/30 px-3 py-2 text-sm">{PLANTA_LABEL[gestion]}</div>
                )}
              </Campo>
              <Campo label="Motivo (mínimo 10 caracteres) *">
                <textarea className="w-full rounded-md border bg-background px-3 py-2 text-sm" rows={2} maxLength={500} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
              </Campo>
              <div className="flex justify-end gap-2">
                <button type="button" className="h-9 rounded-md border px-3 text-sm" onClick={() => setForm(null)} disabled={saving}>Cancelar</button>
                <button type="button" onClick={() => void onGuardar()} disabled={saving}
                  className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!baja} onOpenChange={(o) => { if (!o) setBaja(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{baja?.row.activo ? "Desactivar" : "Reactivar"} SKU {baja?.row.clave}</DialogTitle></DialogHeader>
          {baja && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {baja.row.activo
                  ? "Dejará de aparecer en la captura de cintas. Las cintas, etiquetas y reportes ya registrados no cambian."
                  : "Volverá a aparecer en la captura de cintas."}
              </p>
              <Campo label="Motivo (mínimo 10 caracteres) *">
                <textarea className="w-full rounded-md border bg-background px-3 py-2 text-sm" rows={2} maxLength={500} value={baja.motivo} onChange={(e) => setBaja({ ...baja, motivo: e.target.value })} />
              </Campo>
              <div className="flex justify-end gap-2">
                <button type="button" className="h-9 rounded-md border px-3 text-sm" onClick={() => setBaja(null)} disabled={saving}>Cancelar</button>
                <button type="button" onClick={() => void onCambiarActivo()} disabled={saving}
                  className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
