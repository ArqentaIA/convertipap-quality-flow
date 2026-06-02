import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  queryOptions, useSuspenseQuery, useMutation, useQuery, useQueryClient,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft, AlertTriangle, CheckCircle2, Save, Send, Lock,
  ClipboardCheck, Info, Factory, Printer,
} from "lucide-react";
import { printEtiquetaLiberacion, type EtiquetaData } from "@/lib/etiqueta-liberacion";
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
  listMaquinasCaptura,
  listProductosConSpec,
  getSpecPorProducto,
  upsertMuestraConMediciones,
  listMisMuestrasRecientes,
} from "@/lib/qc.functions";
import { cn } from "@/lib/utils";

const misMuestrasQO = queryOptions({
  queryKey: ["qc", "mis-muestras-recientes"],
  queryFn: () => listMisMuestrasRecientes(),
});

const maquinasQO = queryOptions({
  queryKey: ["qc", "maquinas-captura"],
  queryFn: () => listMaquinasCaptura(),
});

const productosQO = queryOptions({
  queryKey: ["qc", "productos-con-spec"],
  queryFn: () => listProductosConSpec(),
});

const specQO = (productoId: string) =>
  queryOptions({
    queryKey: ["qc", "spec-por-producto", productoId],
    queryFn: () => getSpecPorProducto({ data: { productoId } }),
    enabled: !!productoId,
  });

export const Route = createFileRoute("/calidad/captura")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(maquinasQO),
      context.queryClient.ensureQueryData(productosQO),
    ]),
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

type MedicionInputState = Record<string, { valor: string }>;
type MedicionEstadoUI = "pendiente" | "conforme" | "no_conforme" | "fuera_rango_critico";

function evaluarMedicion(v: number, min: number, max: number): MedicionEstadoUI {
  if (!Number.isFinite(v)) return "pendiente";
  const rango = max - min;
  const tol = Math.abs(rango) * 0.2;
  if (v < min - tol || v > max + tol) return "fuera_rango_critico";
  if (v < min || v > max) return "no_conforme";
  return "conforme";
}

function inferirTurno(d: Date): string {
  const h = d.getHours();
  if (h >= 7 && h < 15) return "A";
  if (h >= 15 && h < 23) return "B";
  return "C";
}

function CapturaCalidadPage() {
  const { data: maquinas } = useSuspenseQuery(maquinasQO);
  const { data: productos } = useSuspenseQuery(productosQO);

  if (maquinas.length === 0) {
    return (
      <AppLayout title="Captura de Muestra de Calidad">
        <div className="mx-auto mt-12 max-w-xl rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <Factory className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Sin máquinas asignadas</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Tu usuario no tiene laboratorio asignado o no hay máquinas activas en tu laboratorio.
            Contacta al administrador.
          </p>
        </div>
      </AppLayout>
    );
  }

  if (productos.length === 0) {
    return (
      <AppLayout title="Captura de Muestra de Calidad">
        <div className="mx-auto mt-12 max-w-xl rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <ClipboardCheck className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Sin productos con especificación vigente</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Pide a un administrador que cargue las especificaciones de producto.
          </p>
          <Button asChild className="mt-6" variant="outline">
            <Link to="/catalogos">Ir a Catálogos</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  return <CapturaInner maquinas={maquinas} productos={productos} />;
}

type Maquina = Awaited<ReturnType<typeof listMaquinasCaptura>>[number];
type Producto = Awaited<ReturnType<typeof listProductosConSpec>>[number];

function CapturaInner({ maquinas, productos }: { maquinas: Maquina[]; productos: Producto[] }) {
  const router = useRouter();
  const auth = useAuth();
  const queryClient = useQueryClient();

  const [maquinaId, setMaquinaId] = useState<string>(maquinas[0]!.id);
  const [productoId, setProductoId] = useState<string>(productos[0]!.producto_id);

  const maquina = maquinas.find((m) => m.id === maquinaId) ?? maquinas[0]!;
  const producto = productos.find((p) => p.producto_id === productoId) ?? productos[0]!;

  const specQuery = useQuery(specQO(producto.producto_id));
  const spec = specQuery.data;

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
  const [numeroRollo, setNumeroRollo] = useState<string>("");
  const [horaMuestreo, setHoraMuestreo] = useState<string>(ahoraLocal);
  const [observaciones, setObservaciones] = useState<string>("");
  const [mediciones, setMediciones] = useState<MedicionInputState>({});
  const [showConfirm, setShowConfirm] = useState(false);

  // Reinicializar mediciones cuando cambia el producto / spec
  useEffect(() => {
    const base: MedicionInputState = {};
    variables.forEach((v) => { base[v.variable_id] = { valor: "" }; });
    setMediciones(base);
  }, [productoId, variables.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const canCapture =
    auth.hasRole("capturista") || auth.hasRole("calidad") ||
    auth.hasRole("gerente_general") || auth.hasRole("administrador");

  const isBlocked = !spec || !canCapture;

  const evalMediciones = useMemo(() => {
    return variables.map((v) => {
      const input = mediciones[v.variable_id] ?? { valor: "" };
      const num = input.valor === "" ? NaN : Number(input.valor);
      const estado = evaluarMedicion(num, v.min_valor, v.max_valor);
      return { spec: v, input, estado, num };
    });
  }, [variables, mediciones]);

  const variablesFueraDeSpec = evalMediciones.filter(
    (m) => m.estado === "no_conforme" || m.estado === "fuera_rango_critico",
  );
  const hayCritico = evalMediciones.some((m) => m.estado === "fuera_rango_critico");

  const upsertFn = useServerFn(upsertMuestraConMediciones);
  const [lastSubmitMode, setLastSubmitMode] = useState<"borrador" | "envio">("borrador");
  const [ultimaEtiqueta, setUltimaEtiqueta] = useState<EtiquetaData | null>(null);
  const mutation = useMutation({
    mutationFn: upsertFn,
    onSuccess: (res: { muestra_id: string }) => {
      void queryClient.invalidateQueries({ queryKey: ["qc"] });
      if (lastSubmitMode === "envio") {
        toast.success("Muestra enviada a revisión");
        // Construir snapshot de etiqueta antes de limpiar el formulario
        const fechaMuestreo = new Date(horaMuestreo);
        const fueraSpecAlguno = variablesFueraDeSpec.length > 0;
        const etiqueta: EtiquetaData = {
          muestraId: res.muestra_id,
          folio: `${maquina.codigo}-${fechaMuestreo.toISOString().slice(0,10)}-${numeroRollo || "SN"}`.replace(/\s+/g,""),
          fecha: fechaMuestreo.toLocaleDateString("es-MX"),
          numeroRollo: numeroRollo || "",
          maquinaCodigo: maquina.codigo,
          maquinaNombre: maquina.nombre,
          productoCodigo: producto.codigo,
          productoNombre: producto.nombre,
          observacionesGenerales: observaciones,
          mediciones: evalMediciones
            .filter((m) => m.input.valor !== "" && Number.isFinite(m.num))
            .map((m) => ({
              clave: m.spec.clave,
              etiqueta: m.spec.etiqueta,
              valor: m.num,
              unidad: m.spec.unidad,
              min: m.spec.min_valor,
              max: m.spec.max_valor,
              fueraSpec: m.estado === "no_conforme" || m.estado === "fuera_rango_critico",
            })),
          estatus: fueraSpecAlguno ? "NO CONFORME" : "CONFORME",
        };
        setUltimaEtiqueta(etiqueta);
        setMediciones((prev) => {
          const r: MedicionInputState = {};
          Object.keys(prev).forEach((k) => { r[k] = { valor: "" }; });
          return r;
        });
        setObservaciones("");
        setNumeroRollo("");
        setHoraMuestreo(toLocalDateTimeInputValue(new Date()));
      } else {
        toast.success("Borrador guardado");
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function handlePrintEtiqueta() {
    if (!ultimaEtiqueta) return;
    try {
      await printEtiquetaLiberacion(ultimaEtiqueta);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo abrir la etiqueta");
    }
  }

  function validar(modo: "borrador" | "envio"): string | null {
    if (!spec) return "Selecciona un producto con especificación vigente";
    if (!canCapture) return "Sin permiso de captura";
    if (!horaMuestreo) return "Indica la hora de muestreo";
    if (new Date(horaMuestreo).getTime() > Date.now() + 60_000)
      return "La hora de muestreo no puede ser futura";
    if (modo === "envio") {
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
    if (!spec) return;

    const variablesSnapshot: Record<string, unknown> = {};
    variables.forEach((v) => {
      variablesSnapshot[v.variable_id] = {
        min: v.min_valor, obj: v.objetivo, max: v.max_valor,
        unidad: v.unidad, etiqueta: v.etiqueta,
      };
    });

    setLastSubmitMode(modo);
    mutation.mutate({
      data: {
        orden_id: null,
        especificacion_id: spec.spec.id,
        especificacion_version: spec.spec.version,
        planta_id: maquina.planta_id,
        maquina_id: maquina.id,
        producto_id: producto.producto_id,
        turno: inferirTurno(new Date(horaMuestreo)),
        operario_id: null,
        numero_rollo: numeroRollo ? Number(numeroRollo) : null,
        tipo_muestreo: "por_rollo" as const,
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
              <p className="text-xs text-muted-foreground">
                {auth.profile?.laboratorio
                  ? `Laboratorio ${auth.profile.laboratorio === "norte" ? "Norte" : "Sur"}`
                  : "Captura directa"}
              </p>
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">A. Máquina y producto</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Máquina</Label>
              <Select value={maquinaId} onValueChange={setMaquinaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona máquina" />
                </SelectTrigger>
                <SelectContent>
                  {maquinas.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="font-mono mr-2">{m.codigo}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="ml-2">{m.nombre}</span>
                      {m.area && (
                        <span className="ml-2 text-xs text-muted-foreground">[{m.area}]</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Producto</Label>
              <Select value={productoId} onValueChange={setProductoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona producto" />
                </SelectTrigger>
                <SelectContent>
                  {productos.map((p) => (
                    <SelectItem key={p.producto_id} value={p.producto_id}>
                      <span className="font-mono mr-2">{p.codigo}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="ml-2">{p.nombre}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        v{p.especificacion_version}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {specQuery.isLoading && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Cargando especificación…</AlertTitle>
          </Alert>
        )}

        {specQuery.error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No se pudo cargar la especificación</AlertTitle>
            <AlertDescription>{specQuery.error.message}</AlertDescription>
          </Alert>
        )}

        {spec && (
          <Card className={cn(isBlocked && "opacity-60 pointer-events-none")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">B. Datos de la muestra</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="rollo">Número de rollo (opcional)</Label>
                <Input
                  id="rollo" type="number" min={1}
                  value={numeroRollo} onChange={(e) => setNumeroRollo(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hora">Hora de muestreo</Label>
                <Input
                  id="hora" type="datetime-local"
                  value={horaMuestreo} onChange={(e) => setHoraMuestreo(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Especificación</Label>
                <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-muted text-sm">
                  <Badge variant="secondary">v{spec.spec.version}</Badge>
                  <span className="text-muted-foreground text-xs">{variables.length} variables</span>
                </div>
              </div>
              <div className="md:col-span-3 space-y-1.5">
                <Label htmlFor="obs">Observaciones generales</Label>
                <Textarea
                  id="obs" maxLength={500} rows={2}
                  value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Condiciones del turno, observaciones, etc."
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

        {spec && (
          <Card className={cn(isBlocked && "opacity-60 pointer-events-none")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">C. Mediciones por variable</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {/* Desktop / tablet landscape: tabla clásica */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm min-w-[680px]">
                  <thead className="text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40">
                    <tr className="border-b">
                      <th className="py-2.5 px-3 text-left font-semibold w-[30%]">Variable</th>
                      <th className="py-2.5 px-2 text-right font-semibold w-16">Min</th>
                      <th className="py-2.5 px-2 text-right font-semibold w-20">Objetivo</th>
                      <th className="py-2.5 px-2 text-right font-semibold w-16">Max</th>
                      <th className="py-2.5 px-3 text-left font-semibold w-[26%]">Valor</th>
                      <th className="py-2.5 px-3 text-left font-semibold w-[140px]">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evalMediciones.map(({ spec: vs, input, estado }) => (
                      <tr key={vs.variable_id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-3 align-middle">
                          <div className="font-medium text-sm leading-tight">{vs.etiqueta}</div>
                          <div className="text-[11px] text-muted-foreground">{vs.unidad}</div>
                        </td>
                        <td className="py-3 px-2 text-right tabular-nums text-muted-foreground align-middle">{vs.min_valor}</td>
                        <td className="py-3 px-2 text-right tabular-nums font-semibold text-foreground align-middle">{vs.objetivo}</td>
                        <td className="py-3 px-2 text-right tabular-nums text-muted-foreground align-middle">{vs.max_valor}</td>
                        <td className="py-3 px-3 align-middle">
                          <Input
                            type="number" step={0.1} inputMode="decimal"
                            disabled={isBlocked}
                            value={input.valor}
                            onChange={(e) => setMediciones((prev) => ({
                              ...prev,
                              [vs.variable_id]: { ...prev[vs.variable_id], valor: e.target.value },
                            }))}
                            className="h-11 text-base font-medium w-full"
                            placeholder="—"
                          />
                        </td>
                        <td className="py-3 px-3 align-middle"><EstadoMedicionBadge estado={estado} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile / tablet portrait: tarjetas por variable */}
              <div className="md:hidden space-y-3 p-4">
                {evalMediciones.map(({ spec: vs, input, estado }) => (
                  <div key={vs.variable_id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <div className="font-semibold text-sm">{vs.etiqueta}</div>
                        <div className="text-xs text-muted-foreground">{vs.unidad}</div>
                      </div>
                      <EstadoMedicionBadge estado={estado} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                      <div className="rounded-md bg-muted/50 px-2 py-1.5">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Min</div>
                        <div className="text-sm font-medium tabular-nums text-muted-foreground">{vs.min_valor}</div>
                      </div>
                      <div className="rounded-md bg-primary/5 px-2 py-1.5 border border-primary/10">
                        <div className="text-[10px] uppercase tracking-wide text-primary/70">Objetivo</div>
                        <div className="text-sm font-bold tabular-nums text-primary">{vs.objetivo}</div>
                      </div>
                      <div className="rounded-md bg-muted/50 px-2 py-1.5">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Max</div>
                        <div className="text-sm font-medium tabular-nums text-muted-foreground">{vs.max_valor}</div>
                      </div>
                    </div>
                    <Input
                      type="number" step={0.1} inputMode="decimal"
                      disabled={isBlocked}
                      value={input.valor}
                      onChange={(e) => setMediciones((prev) => ({
                        ...prev,
                        [vs.variable_id]: { ...prev[vs.variable_id], valor: e.target.value },
                      }))}
                      className="h-12 text-lg font-semibold w-full"
                      placeholder="Capturar valor"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {ultimaEtiqueta && (
          <Alert className="border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Muestra guardada</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>
                Folio <strong className="font-mono">{ultimaEtiqueta.folio}</strong> · estatus{" "}
                <strong>{ultimaEtiqueta.estatus}</strong>. Imprime la etiqueta de liberación para el rollo.
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setUltimaEtiqueta(null)}>
                  Cerrar
                </Button>
                <Button size="sm" onClick={handlePrintEtiqueta}>
                  <Printer className="mr-1.5 h-4 w-4" /> Imprimir Etiqueta
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {spec && (
          <div className="flex flex-wrap items-center justify-end gap-2 sticky bottom-0 bg-background/95 backdrop-blur py-3 border-t">
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
      </div>
    </AppLayout>
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
