import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Download, ChevronLeft, ChevronRight, ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { auditAction } from "@/lib/audit";

export const Route = createFileRoute("/auditoria")({
  head: () => ({
    meta: [
      { title: "Auditoría · ConvertiPap" },
      { name: "description", content: "Bitácora inmutable de acciones y cambios" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AuditoriaPage,
});

type AuditRow = {
  id: string;
  timestamp: string;
  tabla_afectada: string | null;
  operacion: string;
  registro_id: string | null;
  usuario_id: string | null;
  usuario_email: string | null;
  rol: string | null;
  modulo: string | null;
  descripcion_accion: string | null;
};

const PAGE_SIZE = 50;

const OPERACIONES = ["", "INSERT", "UPDATE", "DELETE", "ACTION"];

function toISO(d: string, end = false): string | null {
  if (!d) return null;
  const dt = new Date(end ? `${d}T23:59:59` : `${d}T00:00:00`);
  return dt.toISOString();
}

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCSV(rows: AuditRow[]) {
  const headers = ["timestamp", "usuario_email", "rol", "modulo", "operacion", "tabla_afectada", "registro_id", "descripcion_accion"];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.timestamp, r.usuario_email, r.rol, r.modulo,
      r.operacion, r.tabla_afectada, r.registro_id, r.descripcion_accion,
    ].map(csvEscape).join(","));
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `auditoria_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function AuditoriaPage() {
  const [desde, setDesde] = useState<string>("");
  const [hasta, setHasta] = useState<string>("");
  const [emailFilter, setEmailFilter] = useState<string>("");
  const [modulo, setModulo] = useState<string>("");
  const [operacion, setOperacion] = useState<string>("");
  const [page, setPage] = useState(0);

  const filterKey = useMemo(
    () => JSON.stringify({ desde, hasta, emailFilter, modulo, operacion, page }),
    [desde, hasta, emailFilter, modulo, operacion, page],
  );

  const query = useQuery({
    queryKey: ["audit_log", filterKey],
    queryFn: async () => {
      let q = supabase
        .from("audit_log" as never)
        .select("*", { count: "exact" })
        .order("timestamp", { ascending: false });

      const dIso = toISO(desde, false);
      const hIso = toISO(hasta, true);
      if (dIso) q = q.gte("timestamp", dIso);
      if (hIso) q = q.lte("timestamp", hIso);
      if (emailFilter.trim()) q = q.ilike("usuario_email", `%${emailFilter.trim()}%`);
      if (modulo.trim()) q = q.ilike("modulo", `%${modulo.trim()}%`);
      if (operacion) q = q.eq("operacion", operacion);

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await q.range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as AuditRow[], count: count ?? 0 };
    },
  });

  const exportarCSV = async () => {
    // Re-fetch all matching rows (cap at 5000 for safety)
    let q = supabase
      .from("audit_log" as never)
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(5000);
    const dIso = toISO(desde, false);
    const hIso = toISO(hasta, true);
    if (dIso) q = q.gte("timestamp", dIso);
    if (hIso) q = q.lte("timestamp", hIso);
    if (emailFilter.trim()) q = q.ilike("usuario_email", `%${emailFilter.trim()}%`);
    if (modulo.trim()) q = q.ilike("modulo", `%${modulo.trim()}%`);
    if (operacion) q = q.eq("operacion", operacion);
    const { data, error } = await q;
    if (error) { alert(error.message); return; }
    const rows = (data ?? []) as unknown as AuditRow[];
    downloadCSV(rows);
    void auditAction("auditoria", `Exportación CSV (${rows.length} registros)`, null, {
      desde, hasta, emailFilter, modulo, operacion, total: rows.length,
    });
  };

  const total = query.data?.count ?? 0;
  const rows = query.data?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AppLayout title="Auditoría">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" /> Bitácora inmutable
              </CardTitle>
              <Button onClick={exportarCSV} variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" /> Exportar CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <Label className="text-xs">Desde</Label>
                <Input type="date" value={desde} onChange={(e) => { setPage(0); setDesde(e.target.value); }} />
              </div>
              <div>
                <Label className="text-xs">Hasta</Label>
                <Input type="date" value={hasta} onChange={(e) => { setPage(0); setHasta(e.target.value); }} />
              </div>
              <div>
                <Label className="text-xs">Usuario (email)</Label>
                <Input value={emailFilter} placeholder="ej. juan@..." onChange={(e) => { setPage(0); setEmailFilter(e.target.value); }} />
              </div>
              <div>
                <Label className="text-xs">Módulo / tabla</Label>
                <Input value={modulo} placeholder="muestras_calidad, etiqueta, auth..." onChange={(e) => { setPage(0); setModulo(e.target.value); }} />
              </div>
              <div>
                <Label className="text-xs">Operación</Label>
                <Select value={operacion || "ALL"} onValueChange={(v) => { setPage(0); setOperacion(v === "ALL" ? "" : v); }}>
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todas</SelectItem>
                    {OPERACIONES.filter(Boolean).map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {query.isLoading ? "Cargando..." : `${total.toLocaleString()} registros`}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm tabular-nums">Pág. {page + 1} / {totalPages}</span>
                <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {query.isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando bitácora...
              </div>
            ) : query.error ? (
              <div className="p-6 text-sm text-destructive">{(query.error as Error).message}</div>
            ) : rows.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">Sin registros para los filtros seleccionados.</div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Fecha y hora</th>
                      <th className="px-3 py-2 text-left">Usuario</th>
                      <th className="px-3 py-2 text-left">Rol</th>
                      <th className="px-3 py-2 text-left">Módulo</th>
                      <th className="px-3 py-2 text-left">Operación</th>
                      <th className="px-3 py-2 text-left">Tabla</th>
                      <th className="px-3 py-2 text-left">Descripción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t border-border hover:bg-accent/30">
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums text-xs">
                          {new Date(r.timestamp).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}
                        </td>
                        <td className="px-3 py-2 text-xs">{r.usuario_email ?? "—"}</td>
                        <td className="px-3 py-2 text-xs capitalize">{(r.rol ?? "").replace(/_/g, " ")}</td>
                        <td className="px-3 py-2 text-xs">{r.modulo ?? "—"}</td>
                        <td className="px-3 py-2">
                          <Badge variant={r.operacion === "DELETE" ? "destructive" : r.operacion === "ACTION" ? "secondary" : "outline"}>
                            {r.operacion}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-xs font-mono">{r.tabla_afectada ?? "—"}</td>
                        <td className="px-3 py-2 text-xs">{r.descripcion_accion ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
