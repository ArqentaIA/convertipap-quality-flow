import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
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
  useQcMock, validarCaptura, crearMuestra, evaluarMedicion,
  saveDraft, loadDraft, clearDraft,
} from "@/lib/qc-mock/store";
import type { MedicionEstado } from "@/lib/qc-mock/types";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  orden: z.string().optional(),
  rollo: z.coerce.number().int().positive().optional(),
});

export const Route = createFileRoute("/calidad/captura")({
  validateSearch: searchSchema,
  component: CapturaCalidadPage,
});

type MedicionInputState = Record<string, { valor: string; observacion: string }>;

function CapturaCalidadPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const auth = useAuth();

  const ordenes = useQcMock((s) => s.ordenes);
  const muestrasExistentes = useQcMock((s) => s.muestras);

  // --- Selección de orden -------------------------------------------------
  const ordenesActivas = useMemo(
    () => ordenes.filter((o) => o.estado === "en_proceso"),
    [ordenes],
  );
  const [ordenId, setOrdenId] = useState<string>(search.orden ?? ordenesActivas[0]?.orden_id ?? "");
  const orden = ordenes.find((o) => o.orden_id === ordenId);

  // --- Validación bloqueante ---------------------------------------------
  const bloqueo = useMemo(() => (ordenId ? validarCaptura(ordenId) : { tipo: "orden_no_existe" as const }), [ordenId, ordenes]);
  const isBlocked = bloqueo.tipo !== "ok";

  // --- Estado del formulario ---------------------------------------------
  const ahoraLocal = useMemo(() => toLocalDateTimeInputValue(new Date()), []);
  const [numeroRollo, setNumeroRollo] = useState<string>(
    search.rollo != null ? String(search.rollo) : orden ? String(orden.ultimo_rollo) : "",
  );
  const [horaMuestreo, setHoraMuestreo] = useState<string>(ahoraLocal);
  const [observaciones, setObservaciones] = useState<string>("");
  const [mediciones, setMediciones] = useState<MedicionInputState>({});
  const [showConfirm, setShowConfirm] = useState(false);

  // Inicializa estructura de mediciones cuando cambia la orden
  useEffect(() => {
    if (!orden) return;
    const draft = loadDraft<{
      numero_rollo: string;
      hora_muestreo: string;
      observaciones: string;
      mediciones: MedicionInputState;
    }>(orden.orden_id);
    const base: MedicionInputState = {};
    orden.especificacion_congelada.variables.forEach((v) => {
      base[v.variable_id] = draft?.draft.mediciones[v.variable_id] ?? { valor: "", observacion: "" };
    });
    setMediciones(base);
    if (draft) {
      setNumeroRollo(draft.draft.numero_rollo);
      setHoraMuestreo(draft.draft.hora_muestreo);
      setObservaciones(draft.draft.observaciones);
      toast.info("Borrador recuperado", { description: "Se restauró un borrador local de esta orden." });
    } else {
      setNumeroRollo(search.rollo != null ? String(search.rollo) : String(orden.ultimo_rollo));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orden?.orden_id]);

  // Auto-guardar borrador local (cada cambio)
  useEffect(() => {
    if (!orden || isBlocked) return;
    const handle = window.setTimeout(() => {
      saveDraft(orden.orden_id, {
        numero_rollo: numeroRollo, hora_muestreo: horaMuestreo,
        observaciones, mediciones,
      });
    }, 500);
    return () => window.clearTimeout(handle);
  }, [orden, isBlocked, numeroRollo, horaMuestreo, observaciones, mediciones]);

  // --- Permisos -----------------------------------------------------------
  const canCapture = auth.hasRole("capturista") || auth.hasRole("calidad") || auth.hasRole("gerente_general") || auth.hasRole("administrador");

  // --- Cálculo de estados por medición -----------------------------------
  const evalMediciones = useMemo(() => {
    if (!orden) return [];
    return orden.especificacion_congelada.variables.map((v) => {
      const input = mediciones[v.variable_id] ?? { valor: "", observacion: "" };
      const num = input.valor === "" ? NaN : Number(input.valor);
      const estado: MedicionEstado = Number.isFinite(num)
        ? evaluarMedicion(num, v.min_valor, v.max_valor)
        : "pendiente";
      return { spec: v, input, estado, num };
    });
  }, [orden, mediciones]);

  const variablesFueraDeSpec = evalMediciones.filter(
    (m) => m.estado === "no_conforme" || m.estado === "fuera_rango_critico",
  );
  const hayCritico = evalMediciones.some((m) => m.estado === "fuera_rango_critico");

  // --- Validaciones de envío ---------------------------------------------
  function validar(modo: "borrador" | "envio"): string | null {
    if (!orden) return "Selecciona una orden";
    if (isBlocked) return "La pantalla está bloqueada por validación de orden/máquina";

    if (!horaMuestreo) return "Indica la hora de muestreo";
    const hora = new Date(horaMuestreo);
    if (hora.getTime() > Date.now() + 60_000) return "La hora de muestreo no puede ser futura";

    if (modo === "envio") {
      if (orden.especificacion_congelada.estrategia_muestreo === "por_rollo" && !numeroRollo) {
        return "Indica el número de rollo";
      }
      const faltantes = evalMediciones.filter((m) => m.input.valor === "").map((m) => m.spec.etiqueta);
      if (faltantes.length) return `Falta capturar: ${faltantes.join(", ")}`;
      const inverosimil = evalMediciones.find(
        (m) => Number.isFinite(m.num) && (m.num <= 0 || m.num > 10000),
      );
      if (inverosimil) return `Valor inverosímil en ${inverosimil.spec.etiqueta}`;
    }
    return null;
  }

  function buildMedicionesPayload() {
    return evalMediciones
      .filter((m) => m.input.valor !== "" && Number.isFinite(m.num))
      .map((m) => ({
        variable_id: m.spec.variable_id,
        variable_clave: m.spec.clave,
        valor: m.num,
        observacion: m.input.observacion,
      }));
  }

  function handleSubmit(estado_destino: "borrador" | "pendiente_revision") {
    const err = validar(estado_destino === "borrador" ? "borrador" : "envio");
    if (err) {
      toast.error(err);
      return;
    }
    if (!orden) return;
    const res = crearMuestra({
      orden_id: orden.orden_id,
      numero_rollo: numeroRollo ? Number(numeroRollo) : null,
      hora_muestreo: new Date(horaMuestreo).toISOString(),
      observaciones_generales: observaciones,
      estado_destino,
      capturado_por: auth.profile?.nombre ?? auth.profile?.email ?? "capturista",
      mediciones: buildMedicionesPayload(),
    });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    clearDraft(orden.orden_id);
    if (estado_destino === "pendiente_revision") {
      toast.success("Muestra enviada a revisión");
      void navigate({ to: "/calidad/captura", search: { orden: orden.orden_id } });
      // resetea formulario
      setMediciones((prev) => {
        const reset: MedicionInputState = {};
        Object.keys(prev).forEach((k) => { reset[k] = { valor: "", observacion: "" }; });
        return reset;
      });
      setObservaciones("");
      setNumeroRollo(String(orden.ultimo_rollo + 1));
      setHoraMuestreo(toLocalDateTimeInputValue(new Date()));
    } else {
      toast.success("Borrador guardado");
    }
  }

  function onClickEnviar() {
    const err = validar("envio");
    if (err) {
      toast.error(err);
      return;
    }
    if (variablesFueraDeSpec.length > 0) {
      setShowConfirm(true);
    } else {
      handleSubmit("pendiente_revision");
    }
  }

  // --- Warning de muestra duplicada --------------------------------------
  const muestraDuplicada = useMemo(() => {
    if (!orden || !numeroRollo) return false;
    return muestrasExistentes.some(
      (m) => m.orden_id === orden.orden_id && m.numero_rollo === Number(numeroRollo),
    );
  }, [orden, numeroRollo, muestrasExistentes]);

  return (
    <AppLayout title="Captura de Muestra de Calidad">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.history.back()}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Volver
            </Button>
            <div>
              <h1 className="text-xl font-semibold">Nueva Muestra de Calidad</h1>
              <p className="text-xs text-muted-foreground">Prototipo Fase 5 — datos locales</p>
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

        {/* Selector de orden */}
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
                  <SelectItem key={o.orden_id} value={o.orden_id}>
                    <span className="font-mono mr-2">{o.folio}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="ml-2">{o.producto_codigo} · {o.maquina_nombre}</span>
                    <span className="ml-2 text-xs text-muted-foreground">[{o.estado}]</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Bloqueos */}
        {bloqueo.tipo === "orden_no_existe" && (
          <Alert variant="destructive">
            <Ban className="h-4 w-4" />
            <AlertTitle>Selecciona una orden</AlertTitle>
            <AlertDescription>No hay orden seleccionada para capturar muestra.</AlertDescription>
          </Alert>
        )}
        {bloqueo.tipo === "orden_no_activa" && (
          <Alert variant="destructive">
            <Ban className="h-4 w-4" />
            <AlertTitle>La orden no está en proceso</AlertTitle>
            <AlertDescription>
              Estado actual: <strong>{bloqueo.estado}</strong>. Solo se pueden capturar muestras de órdenes en proceso.
            </AlertDescription>
          </Alert>
        )}
        {bloqueo.tipo === "maquina_sin_orden" && (
          <Alert variant="destructive">
            <Ban className="h-4 w-4" />
            <AlertTitle>La máquina no tiene orden activa</AlertTitle>
            <AlertDescription>
              La máquina <strong>{bloqueo.maquina}</strong> no tiene ninguna orden corriendo. No se pueden capturar muestras.
            </AlertDescription>
          </Alert>
        )}
        {bloqueo.tipo === "orden_distinta" && (
          <Alert variant="destructive">
            <Ban className="h-4 w-4" />
            <AlertTitle>Orden no coincide con la máquina</AlertTitle>
            <AlertDescription>
              La máquina <strong>{bloqueo.maquina}</strong> tiene activa la orden{" "}
              <span className="font-mono font-semibold">{bloqueo.folioActivo}</span>.
              No puedes capturar muestras de <span className="font-mono">{bloqueo.folioSeleccionado}</span> en esta máquina.
            </AlertDescription>
          </Alert>
        )}

        {/* Sección A — Contexto */}
        {orden && (
          <Card className={cn(isBlocked && "opacity-60 pointer-events-none")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">A. Contexto de la orden</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <Field label="Folio"><span className="font-mono">{orden.folio}</span></Field>
              <Field label="Producto">{orden.producto_codigo} — {orden.producto_nombre}</Field>
              <Field label="Máquina">{orden.maquina_nombre}</Field>
              <Field label="Planta">{orden.planta_nombre}</Field>
              <Field label="Turno">{orden.turno}</Field>
              <Field label="Operario">{orden.operario_nombre ?? "—"}</Field>
              <Field label="Especificación vigente">
                <Badge variant="secondary">{orden.especificacion_congelada.version}</Badge>
                <span className="ml-1 text-xs text-muted-foreground">(congelada)</span>
              </Field>
              <Field label="Estrategia">
                {orden.especificacion_congelada.estrategia_muestreo === "por_rollo"
                  ? `Cada ${orden.especificacion_congelada.frecuencia_muestreo} rollo(s)`
                  : `Cada ${orden.especificacion_congelada.frecuencia_muestreo} min`}
              </Field>
            </CardContent>
          </Card>
        )}

        {/* Sección B — Datos de la muestra */}
        {orden && (
          <Card className={cn(isBlocked && "opacity-60 pointer-events-none")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">B. Datos de la muestra</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="rollo">Número de rollo</Label>
                <Input
                  id="rollo" type="number" min={1} disabled={isBlocked || !canCapture}
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
                  id="hora" type="datetime-local" disabled={isBlocked || !canCapture}
                  value={horaMuestreo} onChange={(e) => setHoraMuestreo(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de muestreo</Label>
                <Input value={orden.especificacion_congelada.estrategia_muestreo} disabled className="bg-muted" />
              </div>
              <div className="md:col-span-3 space-y-1.5">
                <Label htmlFor="obs">Observaciones generales</Label>
                <Textarea
                  id="obs" maxLength={500} rows={2} disabled={isBlocked || !canCapture}
                  value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Observaciones del turno, condiciones especiales, etc."
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Banner de no conformidad */}
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

        {/* Sección C — Mediciones */}
        {orden && (
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
                    {evalMediciones.map(({ spec, input, estado }) => (
                      <tr key={spec.variable_id} className="border-b last:border-0">
                        <td className="py-2 font-medium">
                          {spec.etiqueta}
                          <span className="ml-1 text-xs text-muted-foreground">({spec.unidad})</span>
                        </td>
                        <td className="py-2 text-right tabular-nums">{spec.min_valor}</td>
                        <td className="py-2 text-right tabular-nums font-medium">{spec.objetivo}</td>
                        <td className="py-2 text-right tabular-nums">{spec.max_valor}</td>
                        <td className="py-2">
                          <Input
                            type="number" step={spec.paso ?? 0.1} inputMode="decimal"
                            disabled={isBlocked || !canCapture}
                            value={input.valor}
                            onChange={(e) => setMediciones((prev) => ({
                              ...prev,
                              [spec.variable_id]: { ...prev[spec.variable_id], valor: e.target.value },
                            }))}
                            className="h-9"
                            placeholder="—"
                          />
                        </td>
                        <td className="py-2"><EstadoMedicionBadge estado={estado} /></td>
                        <td className="py-2">
                          <Input
                            maxLength={200} disabled={isBlocked || !canCapture}
                            value={input.observacion}
                            onChange={(e) => setMediciones((prev) => ({
                              ...prev,
                              [spec.variable_id]: { ...prev[spec.variable_id], observacion: e.target.value },
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

        {/* Footer */}
        {orden && (
          <div className="flex flex-wrap items-center justify-between gap-2 sticky bottom-0 bg-background/95 backdrop-blur py-3 border-t">
            <Button variant="ghost" asChild>
              <Link to="/calidad/captura" search={{}}>Cancelar</Link>
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline" disabled={isBlocked || !canCapture}
                onClick={() => handleSubmit("borrador")}
              >
                <Save className="mr-1.5 h-4 w-4" /> Guardar borrador
              </Button>
              <Button
                disabled={isBlocked || !canCapture}
                onClick={onClickEnviar}
              >
                <Send className="mr-1.5 h-4 w-4" /> Enviar a Revisión
              </Button>
            </div>
          </div>
        )}

        {/* Confirmación si hay mediciones fuera de spec */}
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
              <AlertDialogAction onClick={() => { setShowConfirm(false); handleSubmit("pendiente_revision"); }}>
                Sí, enviar a revisión
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {!orden && (
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

function EstadoMedicionBadge({ estado }: { estado: MedicionEstado }) {
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
