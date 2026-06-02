import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft, AlertTriangle, Ban, CheckCircle2, Save, Send, Lock,
  ClipboardCheck, Info,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth";
import {
  listOrdenesContexto,
  getOrdenSpec,
  listMuestras,
  upsertMuestraConMediciones,
} from "@/lib/qc.functions";
import { useLabFilter } from "@/lib/lab";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  orden: z.string().optional(),
  rollo: z.coerce.number().int().positive().optional(),
});

const ordenesQO = queryOptions({
  queryKey: ["qc", "ordenes-contexto"],
  queryFn: () => listOrdenesContexto(),
});

const specQO = (ordenId: string) =>
  queryOptions({
    queryKey: ["qc", "orden-spec", ordenId],
    queryFn: () => getOrdenSpec({ data: { ordenId } }),
    enabled: !!ordenId,
  });

const muestrasOrdenQO = (ordenId: string) =>
  queryOptions({
    queryKey: ["qc", "muestras", ordenId],
    queryFn: () => listMuestras({ data: { ordenId } }),
    enabled: !!ordenId,
  });

export const Route = createFileRoute("/calidad/captura")({
  validateSearch: searchSchema,
  loader: ({ context }) => context.queryClient.ensureQueryData(ordenesQO),
  component: CapturaCalidadPage,
  errorComponent: ({ error }) => (
    <AppLayout title="Captura de Muestra de Calidad">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error al cargar</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    </AppLayout>
  ),
});

type MedicionInputState = Record<string, { valor: string; observacion: string }>;
type MedicionEstadoUI = "pendiente" | "conforme" | "no_conforme" | "fuera_rango_critico";

function evaluarMedicion(v: number, min: number, max: number): MedicionEstadoUI {
  if (!Number.isFinite(v)) return "pendiente";
  const rango = max - min;
  const tol = Math.abs(rango) * 0.2;
  if (v < min - tol || v > max + tol) return "fuera_rango_critico";
  if (v < min || v > max) return "no_conforme";
  return "conforme";
}

function CapturaCalidadPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const auth = useAuth();
  const labFilter = useLabFilter();
  const queryClient = useQueryClient();

  const { data: ordenesAll } = useSuspenseQuery(ordenesQO);

  // Filtrado por laboratorio basado en código de máquina ("MP-04", etc.)
  const ordenes = useMemo(
    () => ordenesAll.filter((o) => {
      const codigo = o.maquinas?.codigo;
      return codigo ? labFilter.isMachineAllowed(codigo) : true;
    }),
    [ordenesAll, labFilter],
  );

  const [ordenId, setOrdenId] = useState<string>(search.orden ?? ordenes[0]?.id ?? "");
  const orden = ordenes.find((o) => o.id === ordenId);

  // Spec real + muestras existentes para warning de duplicado
  const specQuery = useSuspenseQuery(specQO(ordenId || ordenes[0]?.id || ""));
  const muestrasQuery = useSuspenseQuery(muestrasOrdenQO(ordenId || ordenes[0]?.id || ""));
  const spec = ordenId ? specQuery.data : null;
  const muestrasExistentes = ordenId ? muestrasQuery.data : [];

  const variables = useMemo(() => {
    if (!spec) return [];
    return (spec.variables as Array<{
      id: string;
      variable_id: string;
      min_valor: number;
      objetivo: number;
      max_valor: number;
      variables_calidad: { id: string; clave: string; etiqueta: string; unidad: string | null } | null;
    }>).map((v) => ({
      variable_id: v.variable_id,
      clave: v.variables_calidad?.clave ?? "",
      etiqueta: v.variables_calidad?.etiqueta ?? "(variable)",
      unidad: v.variables_calidad?.unidad ?? "",
      min_valor: Number(v.min_valor),
      objetivo: Number(v.objetivo),
      max_valor: Number(v.max_valor),
    }));
  }, [spec]);

  const ahoraLocal = useMemo(() => toLocalDateTimeInputValue(new Date()), []);
  const [numeroRollo, setNumeroRollo] = useState<string>(
    search.rollo != null ? String(search.rollo) : orden ? String((orden.producido_rollos ?? 0) + 1) : "",
  );
  const [horaMuestreo, setHoraMuestreo] = useState<string>(ahoraLocal);
  const [observaciones, setObservaciones] = useState<string>("");
  const [mediciones, setMediciones] = useState<MedicionInputState>({});
  const [showConfirm, setShowConfirm] = useState(false);

  // Reinicializa al cambiar orden
  useEffect(() => {
    if (!orden) return;
    const base: MedicionInputState = {};
    variables.forEach((v) => { base[v.variable_id] = { valor: "", observacion: "" }; });
    setMediciones(base);
    setNumeroRollo(
      search.rollo != null ? String(search.rollo) : String((orden.producido_rollos ?? 0) + 1),
    );
    setObservaciones("");
    setHoraMuestreo(toLocalDateTimeInputValue(new Date()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orden?.id, variables.length]);

  const canCapture =
    auth.hasRole("capturista") || auth.hasRole("calidad") ||
    auth.hasRole("gerente_general") || auth.hasRole("administrador");

  const isBlocked = !orden || !spec || !canCapture;

  const evalMediciones = useMemo(() => {
    return variables.map((v) => {
      const input = mediciones[v.variable_id] ?? { valor: "", observacion: "" };
      const num = input.valor === "" ? NaN : Number(input.valor);
      const estado = evaluarMedicion(num, v.min_valor, v.max_valor);
      return { spec: v, input, estado, num };
    });
  }, [variables, mediciones]);

  const variablesFueraDeSpec = evalMediciones.filter(
    (m) => m.estado === "no_conforme" || m.estado === "fuera_rango_critico",
  );
  const hayCritico = evalMediciones.some((m) => m.estado === "fuera_rango_critico");

  const muestraDuplicada = useMemo(() => {
    if (!orden || !numeroRollo) return false;
    return muestrasExistentes.some(
      (m: { orden_id: string; numero_rollo: number | null }) =>
        m.orden_id === orden.id && m.numero_rollo === Number(numeroRollo),
    );
  }, [orden, numeroRollo, muestrasExistentes]);

  const upsertFn = useServerFn(upsertMuestraConMediciones);
  const mutation = useMutation({
    mutationFn: upsertFn,
    onSuccess: (res, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["qc"] });
      if (vars.data.enviar_a_revision) {
        toast.success("Muestra enviada a revisión");
        if (res.reabre_dictamen) {
          toast.warning("Se modificaron mediciones de una muestra ya autorizada — requiere nuevo dictamen");
        }
        // reset
        setMediciones((prev) => {
          const r: MedicionInputState = {};
          Object.keys(prev).forEach((k) => { r[k] = { valor: "", observacion: "" }; });
          return r;
        });
        setObservaciones("");
        if (orden) setNumeroRollo(String((orden.producido_rollos ?? 0) + 1));
        setHoraMuestreo(toLocalDateTimeInputValue(new Date()));
      } else {
        toast.success("Borrador guardado");
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function validar(modo: "borrador" | "envio"): string | null {
    if (!orden || !spec) return "Selecciona una orden";
    if (!canCapture) return "Sin permiso de captura";
    if (!horaMuestreo) return "Indica la hora de muestreo";
    if (new Date(horaMuestreo).getTime() > Date.now() + 60_000)
      return "La hora de muestreo no puede ser futura";
    if (modo === "envio") {
      if (!numeroRollo) return "Indica el número de rollo";
      const faltantes = evalMediciones.filter((m) => m.input.valor === "").map((m) => m.spec.etiqueta);
      if (faltantes.length) return `Falta capturar: ${faltantes.join(", ")}`;
      const inverosimil = evalMediciones.find(
        (m) => Number.isFinite(m.num) && (m.num <= 0 || m.num > 10000),
      );
      if (inverosimil) return `Valor inverosímil en ${inverosimil.spec.etiqueta}`;
    }
    return null;
  }

  function handleSubmit(modo: "borrador" | "envio") {
    const err = validar(modo);
    if (err) { toast.error(err); return; }
    if (!orden || !spec) return;

    const variablesSnapshot: Record<string, unknown> = {};
    variables.forEach((v) => {
      variablesSnapshot[v.variable_id] = {
        min: v.min_valor, obj: v.objetivo, max: v.max_valor,
        unidad: v.unidad, etiqueta: v.etiqueta,
      };
    });

    mutation.mutate({
      data: {
        orden_id: orden.id,
        especificacion_id: spec.spec.id,
        especificacion_version: spec.spec.version,
        planta_id: orden.planta_id,
        maquina_id: orden.maquina_id,
        producto_id: orden.producto_id,
        turno: orden.turno ?? "A",
        operario_id: null,
        numero_rollo: numeroRollo ? Number(numeroRollo) : null,
        tipo_muestreo: "por_rollo",
        hora_muestreo: new Date(horaMuestreo).toISOString(),
        observaciones_generales: observaciones,
        variables_snapshot_json: variablesSnapshot,
        mediciones: evalMediciones
          .filter((m) => m.input.valor !== "" && Number.isFinite(m.num))
          .map((m) => ({
            variable_id: m.spec.variable_id,
            variable_clave: m.spec.clave,
            valor: m.num,
            min_snapshot: m.spec.min_valor,
            objetivo_snapshot: m.spec.objetivo,
            max_snapshot: m.spec.max_valor,
            observacion: m.input.observacion,
          })),
        enviar_a_revision: modo === "envio",
      },
    });
  }

  function onClickEnviar() {
    const err = validar("envio");
    if (err) { toast.error(err); return; }
    if (variablesFueraDeSpec.length > 0) {
      setShowConfirm(true);
    } else {
      handleSubmit("envio");
    }
  }

  return (
    <AppLayout title="Captura de Muestra de Calidad">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.history.back()}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Volver
            </Button>
            <div>
              <h1 className="text-xl font-semibold">Nueva Muestra de Calidad</h1>
              <p className="text-xs text-muted-foreground">Conectado a Lovable Cloud</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <ClipboardCheck className="h-3 w-3" /> Estado: Borrador
            </Badge>
            {!canCapture && (
              <Badge variant="destructive" className="gap-1">
                <Lock className="h-3 w-3" /> Sin permiso de captura
              </Badge>
            )}
          </div>
        </div>

        {ordenes.length === 0 && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Sin órdenes activas</AlertTitle>
            <AlertDescription>
              No hay órdenes en proceso disponibles para tu laboratorio.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Orden de fabricación</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={ordenId} onValueChange={setOrdenId}>
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder="Selecciona una orden" />
              </SelectTrigger>
              <SelectContent>
                {ordenes.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    <span className="font-mono mr-2">{o.folio}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="ml-2">
                      {o.productos?.codigo ?? "—"} · {o.maquinas?.nombre ?? "—"}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">[{o.estado}]</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {!ordenId && (
          <Alert variant="destructive">
            <Ban className="h-4 w-4" />
            <AlertTitle>Selecciona una orden</AlertTitle>
            <AlertDescription>No hay orden seleccionada para capturar muestra.</AlertDescription>
          </Alert>
        )}

        {orden && spec && (
          <Card className={cn(isBlocked && "opacity-60 pointer-events-none")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">A. Contexto de la orden</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <Field label="Folio"><span className="font-mono">{orden.folio}</span></Field>
              <Field label="Producto">{orden.productos?.codigo ?? "—"} — {orden.productos?.nombre ?? "—"}</Field>
              <Field label="Máquina">{orden.maquinas?.nombre ?? "—"}</Field>
              <Field label="Planta">{orden.plantas?.nombre ?? "—"}</Field>
              <Field label="Turno">{orden.turno ?? "—"}</Field>
              <Field label="Rollos producidos">{orden.producido_rollos ?? 0}</Field>
              <Field label="Especificación vigente">
                <Badge variant="secondary">{spec.spec.version}</Badge>
                <span className="ml-1 text-xs text-muted-foreground">({spec.spec.estado})</span>
              </Field>
              <Field label="Variables">{variables.length}</Field>
            </CardContent>
          </Card>
        )}

        {orden && spec && (
          <Card className={cn(isBlocked && "opacity-60 pointer-events-none")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">B. Datos de la muestra</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="rollo">Número de rollo</Label>
                <Input
                  id="rollo" type="number" min={1} disabled={isBlocked}
                  value={numeroRollo} onChange={(e) => setNumeroRollo(e.target.value)}
                />
                {muestraDuplicada && (
                  <p className="flex items-center gap-1 text-xs text-amber-600">
                    <AlertTriangle className="h-3 w-3" /> Ya existe muestra del rollo #{numeroRollo} en esta orden.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hora">Hora de muestreo</Label>
                <Input
                  id="hora" type="datetime-local" disabled={isBlocked}
                  value={horaMuestreo} onChange={(e) => setHoraMuestreo(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de muestreo</Label>
                <Input value="por_rollo" disabled className="bg-muted" />
              </div>
              <div className="md:col-span-3 space-y-1.5">
                <Label htmlFor="obs">Observaciones generales</Label>
                <Textarea
                  id="obs" maxLength={500} rows={2} disabled={isBlocked}
                  value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Observaciones del turno, condiciones especiales, etc."
                />
              </div>
            </CardContent>
          </Card>
        )}

        {variablesFueraDeSpec.length > 0 && !isBlocked && (
          <Alert variant={hayCritico ? "destructive" : "default"} className={cn(!hayCritico && "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100")}>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {hayCritico ? "Mediciones críticas fuera de especificación" : "Mediciones fuera de especificación"}
            </AlertTitle>
            <AlertDescription>
              {variablesFueraDeSpec.length} variable(s) fuera de spec ({variablesFueraDeSpec.map((m) => m.spec.etiqueta).join(", ")}). Calidad deberá evaluar esta muestra.
            </AlertDescription>
          </Alert>
        )}

        {orden && spec && (
          <Card className={cn(isBlocked && "opacity-60 pointer-events-none")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">C. Mediciones por variable</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 text-left font-medium">Variable</th>
                      <th className="py-2 text-right font-medium">Min</th>
                      <th className="py-2 text-right font-medium">Objetivo</th>
                      <th className="py-2 text-right font-medium">Max</th>
                      <th className="py-2 text-left font-medium w-[140px]">Valor</th>
                      <th className="py-2 text-left font-medium w-[130px]">Estado</th>
                      <th className="py-2 text-left font-medium">Observación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evalMediciones.map(({ spec: vs, input, estado }) => (
                      <tr key={vs.variable_id} className="border-b last:border-0">
                        <td className="py-2 font-medium">
                          {vs.etiqueta}
                          <span className="ml-1 text-xs text-muted-foreground">({vs.unidad})</span>
                        </td>
                        <td className="py-2 text-right tabular-nums">{vs.min_valor}</td>
                        <td className="py-2 text-right tabular-nums font-medium">{vs.objetivo}</td>
                        <td className="py-2 text-right tabular-nums">{vs.max_valor}</td>
                        <td className="py-2">
                          <Input
                            type="number" step={0.1} inputMode="decimal"
                            disabled={isBlocked}
                            value={input.valor}
                            onChange={(e) => setMediciones((prev) => ({
                              ...prev,
                              [vs.variable_id]: { ...prev[vs.variable_id], valor: e.target.value },
                            }))}
                            className="h-9"
                            placeholder="—"
                          />
                        </td>
                        <td className="py-2"><EstadoMedicionBadge estado={estado} /></td>
                        <td className="py-2">
                          <Input
                            maxLength={200} disabled={isBlocked}
                            value={input.observacion}
                            onChange={(e) => setMediciones((prev) => ({
                              ...prev,
                              [vs.variable_id]: { ...prev[vs.variable_id], observacion: e.target.value },
                            }))}
                            className="h-9"
                            placeholder="Opcional"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {orden && (
          <div className="flex flex-wrap items-center justify-between gap-2 sticky bottom-0 bg-background/95 backdrop-blur py-3 border-t">
            <Button variant="ghost" asChild>
              <Link to="/calidad/captura" search={{}}>Cancelar</Link>
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline" disabled={isBlocked || mutation.isPending}
                onClick={() => handleSubmit("borrador")}
              >
                <Save className="mr-1.5 h-4 w-4" /> Guardar borrador
              </Button>
              <Button
                disabled={isBlocked || mutation.isPending}
                onClick={onClickEnviar}
              >
                <Send className="mr-1.5 h-4 w-4" />
                {mutation.isPending ? "Enviando..." : "Enviar a Revisión"}
              </Button>
            </div>
          </div>
        )}

        <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar envío a revisión</AlertDialogTitle>
              <AlertDialogDescription>
                Hay <strong>{variablesFueraDeSpec.length}</strong> variable(s) fuera de especificación
                ({variablesFueraDeSpec.map((m) => m.spec.etiqueta).join(", ")}).
                La muestra quedará marcada como no conforme y deberá ser evaluada por Calidad.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => { setShowConfirm(false); handleSubmit("envio"); }}>
                Sí, enviar a revisión
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {!orden && ordenes.length > 0 && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Sin orden seleccionada</AlertTitle>
            <AlertDescription>Selecciona una orden de fabricación para iniciar la captura de muestra.</AlertDescription>
          </Alert>
        )}
      </div>
    </AppLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  );
}

function EstadoMedicionBadge({ estado }: { estado: MedicionEstadoUI }) {
  if (estado === "pendiente") return <Badge variant="outline" className="text-muted-foreground">—</Badge>;
  if (estado === "conforme") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300 border-emerald-500/40 gap-1">
        <CheckCircle2 className="h-3 w-3" /> Conforme
      </Badge>
    );
  }
  if (estado === "no_conforme") {
    return (
      <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300 border-amber-500/40 gap-1">
        <AlertTriangle className="h-3 w-3" /> Fuera de spec
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <AlertTriangle className="h-3 w-3" /> Crítico
    </Badge>
  );
}

function toLocalDateTimeInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
