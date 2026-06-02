import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Pencil, Power, Ban } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listCatalogos, listTiposProducto,
  upsertPlanta, togglePlanta,
  upsertMaquina, toggleMaquina,
  upsertProducto, toggleProducto,
  cancelarOrdenCatalogo,
} from "@/lib/catalogos.functions";

export const Route = createFileRoute("/catalogos")({
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogosQO),
  component: CatalogosPage,
});

const catalogosQO = queryOptions({
  queryKey: ["catalogos"],
  queryFn: () => listCatalogos(),
});

const tiposProductoQO = queryOptions({
  queryKey: ["catalogos", "tipos-producto"],
  queryFn: () => listTiposProducto(),
});

type Tab = "plantas" | "maquinas" | "productos" | "ordenes";

function CatalogosPage() {
  const [tab, setTab] = useState<Tab>("plantas");
  const { data } = useSuspenseQuery(catalogosQO);
  const { hasRole } = useAuth();
  const isAdmin = hasRole("administrador");

  return (
    <AppLayout title="Catálogos">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1 shadow-sm">
            {([
              ["plantas", `Plantas (${data.plantas.length})`],
              ["maquinas", `Máquinas (${data.maquinas.length})`],
              ["productos", `Productos (${data.productos.length})`],
              ["ordenes", `Órdenes (${data.ordenes.length})`],
            ] as [Tab, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >{label}</button>
            ))}
          </div>
          {!isAdmin && (
            <p className="text-xs text-muted-foreground">
              Solo lectura · Solo el rol <strong>administrador</strong> puede modificar catálogos.
            </p>
          )}
        </div>

        {tab === "plantas" && <PlantasTab plantas={data.plantas} isAdmin={isAdmin} />}
        {tab === "maquinas" && <MaquinasTab maquinas={data.maquinas} plantas={data.plantas} isAdmin={isAdmin} />}
        {tab === "productos" && <ProductosTab productos={data.productos} isAdmin={isAdmin} />}
        {tab === "ordenes" && <OrdenesTab ordenes={data.ordenes} isAdmin={isAdmin} />}
      </div>
    </AppLayout>
  );
}

// ============================ PLANTAS ============================

type Planta = { id: string; codigo: string; nombre: string; ubicacion: string | null; activo: boolean };

function PlantasTab({ plantas, isAdmin }: { plantas: Planta[]; isAdmin: boolean }) {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertPlanta);
  const toggleFn = useServerFn(togglePlanta);
  const [editing, setEditing] = useState<Partial<Planta> | null>(null);

  const upsert = useMutation({
    mutationFn: upsertFn,
    onSuccess: () => {
      toast.success("Planta guardada");
      void qc.invalidateQueries({ queryKey: ["catalogos"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: toggleFn,
    onSuccess: () => {
      toast.success("Estado actualizado");
      void qc.invalidateQueries({ queryKey: ["catalogos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <SectionHeader title="Plantas" onAdd={() => setEditing({ activo: true })} />
      <Card>
        <Table headers={["Código", "Nombre", "Ubicación", "Estado", ""]}>
          {plantas.map((p) => (
            <tr key={p.id} className="border-t border-border hover:bg-muted/30">
              <Td bold>{p.codigo}</Td>
              <Td>{p.nombre}</Td>
              <Td>{p.ubicacion ?? "—"}</Td>
              <Td><StatusBadge activo={p.activo} /></Td>
              <RowActions
                onEdit={() => setEditing(p)}
                activo={p.activo}
                onToggle={() => toggle.mutate({ data: { id: p.id, activo: !p.activo } })}
              />
            </tr>
          ))}
        </Table>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar planta" : "Nueva planta"}</DialogTitle>
            <DialogDescription>Datos generales de la planta.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Código">
              <Input value={editing?.codigo ?? ""} onChange={(e) => setEditing({ ...editing!, codigo: e.target.value })} />
            </Field>
            <Field label="Nombre">
              <Input value={editing?.nombre ?? ""} onChange={(e) => setEditing({ ...editing!, nombre: e.target.value })} />
            </Field>
            <Field label="Ubicación (opcional)">
              <Input value={editing?.ubicacion ?? ""} onChange={(e) => setEditing({ ...editing!, ubicacion: e.target.value })} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button
              disabled={upsert.isPending}
              onClick={() => upsert.mutate({ data: {
                id: editing?.id,
                codigo: (editing?.codigo ?? "").trim(),
                nombre: (editing?.nombre ?? "").trim(),
                ubicacion: editing?.ubicacion ?? null,
                activo: editing?.activo ?? true,
              } })}
            >Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================ MAQUINAS ============================

type Maquina = {
  id: string; codigo: string; nombre: string; planta_id: string;
  area: string | null; activo: boolean; plantas?: { nombre: string; codigo: string } | null;
};

function MaquinasTab({ maquinas, plantas, isAdmin }: { maquinas: Maquina[]; plantas: Planta[]; isAdmin: boolean }) {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertMaquina);
  const toggleFn = useServerFn(toggleMaquina);
  const [editing, setEditing] = useState<Partial<Maquina> | null>(null);

  const upsert = useMutation({
    mutationFn: upsertFn,
    onSuccess: () => {
      toast.success("Máquina guardada");
      void qc.invalidateQueries({ queryKey: ["catalogos"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: toggleFn,
    onSuccess: () => {
      toast.success("Estado actualizado");
      void qc.invalidateQueries({ queryKey: ["catalogos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <SectionHeader title="Máquinas" onAdd={() => setEditing({ activo: true })} />
      <Card>
        <Table headers={["Código", "Nombre", "Planta", "Área", "Estado", ""]}>
          {maquinas.map((m) => (
            <tr key={m.id} className="border-t border-border hover:bg-muted/30">
              <Td bold>{m.codigo}</Td>
              <Td>{m.nombre}</Td>
              <Td>{m.plantas?.nombre ?? "—"}</Td>
              <Td>{m.area ?? "—"}</Td>
              <Td><StatusBadge activo={m.activo} /></Td>
              <RowActions
                onEdit={() => setEditing(m)}
                activo={m.activo}
                onToggle={() => toggle.mutate({ data: { id: m.id, activo: !m.activo } })}
              />
            </tr>
          ))}
        </Table>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar máquina" : "Nueva máquina"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Código">
              <Input value={editing?.codigo ?? ""} onChange={(e) => setEditing({ ...editing!, codigo: e.target.value })} />
            </Field>
            <Field label="Nombre">
              <Input value={editing?.nombre ?? ""} onChange={(e) => setEditing({ ...editing!, nombre: e.target.value })} />
            </Field>
            <Field label="Planta">
              <Select value={editing?.planta_id ?? ""} onValueChange={(v) => setEditing({ ...editing!, planta_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecciona una planta" /></SelectTrigger>
                <SelectContent>
                  {plantas.filter((p) => p.activo).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.codigo} — {p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Área (opcional)">
              <Input value={editing?.area ?? ""} onChange={(e) => setEditing({ ...editing!, area: e.target.value })} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button
              disabled={upsert.isPending}
              onClick={() => {
                if (!editing?.planta_id) { toast.error("Selecciona una planta"); return; }
                upsert.mutate({ data: {
                  id: editing.id,
                  codigo: (editing.codigo ?? "").trim(),
                  nombre: (editing.nombre ?? "").trim(),
                  planta_id: editing.planta_id,
                  area: editing.area ?? null,
                  activo: editing.activo ?? true,
                } });
              }}
            >Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================ PRODUCTOS ============================

type Producto = {
  id: string; codigo: string; nombre: string; tipo_id: string;
  descripcion: string | null; gramaje: number | null; capas: number | null; activo: boolean;
};

function ProductosTab({ productos, isAdmin }: { productos: Producto[]; isAdmin: boolean }) {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertProducto);
  const toggleFn = useServerFn(toggleProducto);
  const { data: tipos } = useSuspenseQuery(tiposProductoQO);
  const [editing, setEditing] = useState<Partial<Producto> | null>(null);

  const upsert = useMutation({
    mutationFn: upsertFn,
    onSuccess: () => {
      toast.success("Producto guardado");
      void qc.invalidateQueries({ queryKey: ["catalogos"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: toggleFn,
    onSuccess: () => {
      toast.success("Estado actualizado");
      void qc.invalidateQueries({ queryKey: ["catalogos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <SectionHeader title="Productos" onAdd={() => setEditing({ activo: true })} />
      <Card>
        <Table headers={["Código", "Nombre", "Gramaje", "Capas", "Estado", ""]}>
          {productos.map((p) => (
            <tr key={p.id} className="border-t border-border hover:bg-muted/30">
              <Td bold>{p.codigo}</Td>
              <Td>{p.nombre}</Td>
              <Td>{p.gramaje ?? "—"}</Td>
              <Td>{p.capas ?? "—"}</Td>
              <Td><StatusBadge activo={p.activo} /></Td>
              <RowActions
                onEdit={() => setEditing(p)}
                activo={p.activo}
                onToggle={() => toggle.mutate({ data: { id: p.id, activo: !p.activo } })}
              />
            </tr>
          ))}
        </Table>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar producto" : "Nuevo producto"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Código">
              <Input value={editing?.codigo ?? ""} onChange={(e) => setEditing({ ...editing!, codigo: e.target.value })} />
            </Field>
            <Field label="Nombre">
              <Input value={editing?.nombre ?? ""} onChange={(e) => setEditing({ ...editing!, nombre: e.target.value })} />
            </Field>
            <Field label="Tipo">
              <Select value={editing?.tipo_id ?? ""} onValueChange={(v) => setEditing({ ...editing!, tipo_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecciona un tipo" /></SelectTrigger>
                <SelectContent>
                  {tipos.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.codigo} — {t.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Gramaje (g/m²)">
                <Input
                  type="number" step="0.1"
                  value={editing?.gramaje ?? ""}
                  onChange={(e) => setEditing({ ...editing!, gramaje: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </Field>
              <Field label="Capas">
                <Input
                  type="number"
                  value={editing?.capas ?? ""}
                  onChange={(e) => setEditing({ ...editing!, capas: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button
              disabled={upsert.isPending}
              onClick={() => {
                if (!editing?.tipo_id) { toast.error("Selecciona un tipo"); return; }
                upsert.mutate({ data: {
                  id: editing.id,
                  codigo: (editing.codigo ?? "").trim(),
                  nombre: (editing.nombre ?? "").trim(),
                  tipo_id: editing.tipo_id,
                  descripcion: editing.descripcion ?? null,
                  gramaje: editing.gramaje ?? null,
                  capas: editing.capas ?? null,
                  activo: editing.activo ?? true,
                } });
              }}
            >Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================ ORDENES ============================

type Orden = {
  id: string; folio: string; estado: string; turno: string | null;
  objetivo_kg: number | null; objetivo_rollos: number | null;
  producido_kg: number; producido_rollos: number;
  fecha_programada: string | null; fecha_inicio: string | null; fecha_fin: string | null;
  productos?: { codigo: string; nombre: string } | null;
  maquinas?: { codigo: string; nombre: string } | null;
  plantas?: { codigo: string; nombre: string } | null;
};

function OrdenesTab({ ordenes, isAdmin }: { ordenes: Orden[]; isAdmin: boolean }) {
  const qc = useQueryClient();
  const cancelFn = useServerFn(cancelarOrdenCatalogo);
  const [confirming, setConfirming] = useState<Orden | null>(null);

  const cancel = useMutation({
    mutationFn: cancelFn,
    onSuccess: () => {
      toast.success("Orden cancelada");
      void qc.invalidateQueries({ queryKey: ["catalogos"] });
      setConfirming(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Órdenes de fabricación</h2>
        <p className="text-xs text-muted-foreground">
          Las órdenes se crean desde el módulo <strong>Producción</strong>.
        </p>
      </div>
      <Card>
        <Table headers={["Folio", "Producto", "Máquina", "Estado", "Turno", "Producido", "", ""]}>
          {ordenes.map((o) => (
            <tr key={o.id} className="border-t border-border hover:bg-muted/30">
              <Td bold className="font-mono">{o.folio}</Td>
              <Td>{o.productos?.codigo ?? "—"}</Td>
              <Td>{o.maquinas?.codigo ?? "—"}</Td>
              <Td><EstadoBadge estado={o.estado} /></Td>
              <Td>{o.turno ?? "—"}</Td>
              <Td>{o.producido_rollos} rollos · {Number(o.producido_kg).toFixed(0)} kg</Td>
              <td className="px-4 py-3 text-right">
                {!["finalizada", "cancelada"].includes(o.estado) && (
                  <button
                    className="text-muted-foreground hover:text-destructive"
                    title="Cancelar"
                    onClick={() => setConfirming(o)}
                  >
                    <Ban className="h-4 w-4" />
                  </button>
                )}
              </td>
              <td />
            </tr>
          ))}
        </Table>
      </Card>

      <AlertDialog open={confirming !== null} onOpenChange={(o) => !o && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar orden {confirming?.folio}</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción marca la orden como cancelada y la retira de producción. No se puede revertir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cerrar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirming && cancel.mutate({ data: { id: confirming.id, motivo: "Cancelada desde catálogos" } })}
            >Cancelar orden</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ============================ UI helpers ============================

function SectionHeader({ title, onAdd, canEdit = true }: { title: string; onAdd: () => void; canEdit?: boolean }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {canEdit && (
        <Button onClick={onAdd} size="sm">
          <Plus className="h-4 w-4 mr-1.5" /> Nuevo
        </Button>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">{children}</div>;
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
        <tr>{headers.map((h, i) => <th key={i} className="px-4 py-3">{h}</th>)}</tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function Td({ children, bold, className = "" }: { children: React.ReactNode; bold?: boolean; className?: string }) {
  return <td className={`px-4 py-3 tabular-nums ${bold ? "font-medium text-foreground" : "text-foreground/90"} ${className}`}>{children}</td>;
}

function RowActions({ onEdit, activo, onToggle, canEdit = true }: { onEdit: () => void; activo: boolean; onToggle: () => void; canEdit?: boolean }) {
  if (!canEdit) return <td className="px-4 py-3" />;
  return (
    <td className="px-4 py-3 text-right">
      <div className="flex items-center justify-end gap-2">
        <button onClick={onEdit} className="text-muted-foreground hover:text-primary" title="Editar">
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={onToggle}
          className={`hover:text-primary ${activo ? "text-amber-600" : "text-emerald-600"}`}
          title={activo ? "Desactivar" : "Activar"}
        >
          <Power className="h-4 w-4" />
        </button>
      </div>
    </td>
  );
}

function StatusBadge({ activo }: { activo: boolean }) {
  return activo
    ? <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/40 dark:text-emerald-300">Activa</Badge>
    : <Badge variant="outline" className="text-muted-foreground">Inactiva</Badge>;
}

function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, string> = {
    borrador: "bg-muted text-muted-foreground",
    programada: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    en_proceso: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    pausada: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    finalizada: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
    cancelada: "bg-destructive/15 text-destructive",
  };
  return <Badge className={`${map[estado] ?? ""} border-0`}>{estado.replace(/_/g, " ")}</Badge>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
