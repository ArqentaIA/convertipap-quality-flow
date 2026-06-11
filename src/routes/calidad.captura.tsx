import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Lock,
  ClipboardCheck,
  Info,
  Factory,
  Printer,
} from "lucide-react";
import { printEtiquetaLiberacion, type EtiquetaData } from "@/lib/etiqueta-liberacion";
import { auditAction } from "@/lib/audit";
import { getEffectiveStatus, toEtiquetaEstatus } from "@/lib/qc-effective-status";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import {
  listMaquinasCaptura,
  listProductosConSpec,
  getSpecPorProducto,
  upsertMuestraConMediciones,
  listMisMuestrasRecientes,
  dictaminarMuestra,
} from "@/lib/qc.functions";
import { getCumplimientoIndicador } from "@/lib/cumplimiento.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getAppSettings } from "@/lib/settings.functions";
import { cn } from "@/lib/utils";

const ROLLO_REGEX = /^[A-Za-z0-9-]{1,30}$/;

const settingsQO = queryOptions({
  queryKey: ["app", "settings"],
  queryFn: () => getAppSettings(),
});

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

function scrollFieldIntoView(el: HTMLElement) {
  window.requestAnimationFrame(() => {
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      el.scrollIntoView();
    }
  });
}

function focusNextCaptureField(current: HTMLElement) {
  const fields = Array.from(
    document.querySelectorAll<HTMLElement>("[data-capture-field]"),
  ).filter((el) => !el.hasAttribute("disabled"));
  const idx = fields.indexOf(current);
  if (idx === -1) return;
  const next = fields[idx + 1];
  if (next) {
    next.focus();
    scrollFieldIntoView(next);
  }
}

function esVariableSinTopeSuperior(clave?: string | null): boolean {
  if (!clave) return false;
  const k = clave.toLowerCase().replace(/[\s_-]/g, "");
  return k.includes("blancura") || k.includes("r457");
}

function evaluarMedicion(
  v: number,
  min: number,
  max: number,
  clave?: string | null,
): MedicionEstadoUI {
  if (!Number.isFinite(v)) return "pendiente";
  const sinTope = esVariableSinTopeSuperior(clave);
  const rango = max - min;
  const tol = Math.abs(rango) * 0.2;
  if (v < min - tol) return "fuera_rango_critico";
  if (!sinTope && v > max + tol) return "fuera_rango_critico";
  if (v < min) return "no_conforme";
  if (!sinTope && v > max) return "no_conforme";
  return "conforme";
}

function esValorInverosimil(m: {
  spec: { clave: string; etiqueta: string; min_valor: number; max_valor: number };
  num: number;
}) {
  if (!Number.isFinite(m.num)) return false;
  if (m.spec.clave === "uniones") return m.num < 0 || m.num > 100;
  if (m.spec.clave === "blancuraA" || m.spec.clave === "blancuraB") {
    return m.num < -100 || m.num > 100;
  }
  if (m.spec.clave === "peso") return m.num <= 0 || m.num > 50_000;
  const aceptaCeroONegativo = m.spec.min_valor <= 0;
  return (!aceptaCeroONegativo && m.num <= 0) || m.num > 10_000;
}

function inferirTurno(
  d: Date,
  settings?: {
    turno1_inicio: string;
    turno1_fin: string;
    turno2_inicio: string;
    turno2_fin: string;
    turno3_inicio: string;
    turno3_fin: string;
  } | null,
): "1" | "2" | "3" {
  const mins = d.getHours() * 60 + d.getMinutes();
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const s = settings ?? {
    turno1_inicio: "07:00",
    turno1_fin: "15:00",
    turno2_inicio: "15:00",
    turno2_fin: "23:00",
    turno3_inicio: "23:00",
    turno3_fin: "07:00",
  };
  const inRange = (start: string, end: string) => {
    const a = toMin(start),
      b = toMin(end);
    return a <= b ? mins >= a && mins < b : mins >= a || mins < b;
  };
  if (inRange(s.turno1_inicio, s.turno1_fin)) return "1";
  if (inRange(s.turno2_inicio, s.turno2_fin)) return "2";
  return "3";
}

function CapturaCalidadPage() {
  const auth = useAuth();
  const hasAuthToken = auth.isAuthenticated && !!auth.session?.access_token;
  const maquinasQuery = useQuery({ ...maquinasQO, enabled: hasAuthToken, retry: false });
  const productosQuery = useQuery({ ...productosQO, enabled: hasAuthToken, retry: false });
  const maquinas = maquinasQuery.data ?? [];
  const productos = productosQuery.data ?? [];

  if (auth.loading || !hasAuthToken || maquinasQuery.isLoading || productosQuery.isLoading) {
    return (
      <AppLayout title="Captura de Muestra de Calidad">
        <div className="mx-auto mt-12 max-w-xl rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <ClipboardCheck className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Cargando captura</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Preparando máquinas y productos disponibles.
          </p>
        </div>
      </AppLayout>
    );
  }

  if (maquinasQuery.error || productosQuery.error) {
    const message =
      maquinasQuery.error?.message ??
      productosQuery.error?.message ??
      "No se pudo cargar la información";
    return (
      <AppLayout title="Captura de Muestra de Calidad">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error al cargar captura</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      </AppLayout>
    );
  }

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
          <h2 className="text-lg font-semibold text-foreground">
            Sin productos con especificación vigente
          </h2>
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
  const hasAuthToken = auth.isAuthenticated && !!auth.session?.access_token;

  const specQuery = useQuery({
    ...specQO(producto.producto_id),
    enabled: hasAuthToken && !!producto.producto_id,
    retry: false,
  });
  const spec = specQuery.data;

  const settingsQuery = useQuery({ ...settingsQO, enabled: hasAuthToken, retry: false });
  const settings = settingsQuery.data;

  const variables = useMemo(() => {
    if (!spec) return [];
    return (
      spec.variables as Array<{
        id: string;
        variable_id: string;
        min_valor: number;
        objetivo: number;
        max_valor: number;
        variables_calidad: {
          id: string;
          clave: string;
          etiqueta: string;
          unidad: string | null;
          orden?: number;
        } | null;
      }>
    )
      .map((v) => ({
        variable_id: v.variable_id,
        clave: v.variables_calidad?.clave ?? "",
        etiqueta: v.variables_calidad?.etiqueta ?? "(variable)",
        unidad: v.variables_calidad?.unidad ?? "",
        orden: v.variables_calidad?.orden ?? 999,
        min_valor: Number(v.min_valor),
        objetivo: Number(v.objetivo),
        max_valor: Number(v.max_valor),
      }))
      .sort((a, b) => a.orden - b.orden);
  }, [spec]);

  const ahoraLocal = useMemo(() => toLocalDateTimeInputValue(new Date()), []);
  const [numeroRollo, setNumeroRollo] = useState<string>("");
  const [horaMuestreo, setHoraMuestreo] = useState<string>(ahoraLocal);
  const [observaciones, setObservaciones] = useState<string>("");
  const [mediciones, setMediciones] = useState<MedicionInputState>({});
  // Turno: auto-inferido por hora, editable manualmente
  const turnoInferido = useMemo(
    () => inferirTurno(new Date(horaMuestreo || Date.now()), settings),
    [horaMuestreo, settings],
  );
  const [turno, setTurno] = useState<"1" | "2" | "3">(turnoInferido);
  useEffect(() => {
    setTurno(turnoInferido);
  }, [turnoInferido]);

  // Personal del turno
  const [jefeMaquina, setJefeMaquina] = useState<string>("");
  const [operador, setOperador] = useState<string>("");
  const [prensero, setPrensero] = useState<string>("");
  const [analista, setAnalista] = useState<string>("");

  // Parámetros operativos (opcionales)
  const [velocidadMaquina, setVelocidadMaquina] = useState<string>("");
  const [velocidadEnrollador, setVelocidadEnrollador] = useState<string>("");
  const [crepadoPct, setCrepadoPct] = useState<string>("");
  // Cumplimiento: calculado automáticamente desde la base de datos.
  // No se permite captura ni edición manual.
  const [porcentajeRupturasPct, setPorcentajeRupturasPct] = useState<string>("");
  const [destino, setDestino] = useState<string>("");

  // Sección F — Cierre: estatus manual y defectos
  const DEFECTOS_OPCIONES = ["Arruga", "Picado", "Porosidad", "Hoyos por gomas", "Otro"] as const;
  const [estatusLiberacion, setEstatusLiberacion] = useState<"" | "L" | "NC" | "C">("");
  const [defectos, setDefectos] = useState<string[]>([]);
  const toggleDefecto = (d: string) =>
    setDefectos((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  // Reinicializar mediciones cuando cambia el producto / spec
  useEffect(() => {
    const base: MedicionInputState = {};
    variables.forEach((v) => {
      base[v.variable_id] = { valor: "" };
    });
    setMediciones(base);
  }, [productoId, variables.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cálculo automático de Relación MD/CD = tensionMD / tensionCD
  const mdVarId = useMemo(
    () => variables.find((v) => v.clave === "tensionMD")?.variable_id,
    [variables],
  );
  const cdVarId = useMemo(
    () => variables.find((v) => v.clave === "tensionCD")?.variable_id,
    [variables],
  );
  const relVarId = useMemo(
    () => variables.find((v) => v.clave === "relMDCD")?.variable_id,
    [variables],
  );
  const mdValor = mdVarId ? (mediciones[mdVarId]?.valor ?? "") : "";
  const cdValor = cdVarId ? (mediciones[cdVarId]?.valor ?? "") : "";
  useEffect(() => {
    if (!relVarId) return;
    const md = Number(mdValor);
    const cd = Number(cdValor);
    const calc =
      mdValor !== "" && cdValor !== "" && Number.isFinite(md) && Number.isFinite(cd) && cd !== 0
        ? (md / cd).toFixed(2)
        : "";
    setMediciones((prev) => {
      const cur = prev[relVarId]?.valor ?? "";
      if (cur === calc) return prev;
      return { ...prev, [relVarId]: { ...prev[relVarId], valor: calc } };
    });
  }, [mdValor, cdValor, relVarId]);

  // Cierre de turno automático: al detectar cambio de turno según configuración,
  // se limpia el formulario, se notifica y se invalida producción para todas las máquinas.
  const lastTurnoRef = useRef<"1" | "2" | "3" | null>(null);
  useEffect(() => {
    if (lastTurnoRef.current === null) {
      lastTurnoRef.current = inferirTurno(new Date(), settings);
    }
    const tick = () => {
      const actual = inferirTurno(new Date(), settings);
      const previo = lastTurnoRef.current;
      if (previo && actual !== previo) {
        lastTurnoRef.current = actual;
        setNumeroRollo("");
        setMediciones((prev) => {
          const next: MedicionInputState = {};
          Object.keys(prev).forEach((k) => {
            next[k] = { valor: "" };
          });
          return next;
        });
        setJefeMaquina("");
        setOperador("");
        setPrensero("");
        setAnalista("");
        setObservaciones("");
        setEstatusLiberacion("");
        setDefectos([]);
        const ahora = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        setHoraMuestreo(
          `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}T${pad(ahora.getHours())}:${pad(ahora.getMinutes())}`,
        );
        toast.success(
          `Cierre de turno automático · Turno ${previo} cerrado. Iniciando Turno ${actual}.`,
          { duration: 6000 },
        );
        void auditAction(
          "calidad.captura",
          `Cierre automático de Turno ${previo} (todas las máquinas) · inicia Turno ${actual}`,
        );
        void queryClient.invalidateQueries({ queryKey: ["produccion"] });
        void queryClient.invalidateQueries({ queryKey: ["qc"] });
      }
    };
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [settings, queryClient]);

  const canCapture =
    auth.hasRole("capturista") ||
    auth.hasRole("calidad") ||
    auth.hasRole("gerente_general") ||
    auth.hasRole("administrador");

  const isBlocked = !spec || !canCapture;

  const evalMediciones = useMemo(() => {
    return variables.map((v) => {
      const input = mediciones[v.variable_id] ?? { valor: "" };
      const num = input.valor === "" ? NaN : Number(input.valor);
      const estado = evaluarMedicion(num, v.min_valor, v.max_valor, v.clave);
      return { spec: v, input, estado, num };
    });
  }, [variables, mediciones]);

  const variablesFueraDeSpec = evalMediciones.filter(
    (m) => m.estado === "no_conforme" || m.estado === "fuera_rango_critico",
  );
  const hayCritico = evalMediciones.some((m) => m.estado === "fuera_rango_critico");

  const upsertFn = useServerFn(upsertMuestraConMediciones);
  const dictaminarFn = useServerFn(dictaminarMuestra);
  const [ultimaEtiqueta, setUltimaEtiqueta] = useState<EtiquetaData | null>(null);
  const [muestraRecienId, setMuestraRecienId] = useState<string | null>(null);

  // --- Diálogo de liberación / cambio de estatus (Gerente de Calidad) ---
  // Autorizado por Administrador: Capturistas también pueden liberar rollos.
  const puedeLiberar =
    auth.hasRole("calidad") ||
    auth.hasRole("administrador") ||
    auth.hasRole("capturista");
  const [liberarMuestra, setLiberarMuestra] = useState<MuestraReciente | null>(null);
  const [liberarDictamen, setLiberarDictamen] = useState<"liberada" | "concesion" | "rechazada">(
    "liberada",
  );
  const [liberarObservaciones, setLiberarObservaciones] = useState("");
  const liberarMutation = useMutation({
    mutationFn: dictaminarFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["qc"] });
      await queryClient.invalidateQueries({ queryKey: ["produccion"] });
      toast.success("Estatus actualizado", {
        description: "El cambio quedó registrado en auditoría con tus observaciones.",
      });
      setLiberarMuestra(null);
      setLiberarObservaciones("");
      setLiberarDictamen("liberada");
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo actualizar el estatus"),
  });

  const mutation = useMutation({
    mutationFn: upsertFn,
    onSuccess: async (res: { muestra_id: string }) => {
      await queryClient.invalidateQueries({ queryKey: ["qc"] });
      await queryClient.invalidateQueries({ queryKey: ["produccion"] });
      await queryClient.refetchQueries({
        queryKey: ["qc", "mis-muestras-recientes"],
        type: "active",
      });
      await queryClient.refetchQueries({
        queryKey: ["produccion", "maquinas"],
        type: "active",
      });
      const folioToast = `${numeroRollo || "SN"} · ${maquina.codigo}`;
      const opcionalesTexto: string[] = [
        jefeMaquina, operador, prensero, analista,
        velocidadMaquina, velocidadEnrollador, crepadoPct,
        porcentajeRupturasPct, destino, observaciones, estatusLiberacion,
      ];
      let noObligatoriosFaltantes = opcionalesTexto.filter((v) => !String(v ?? "").trim()).length;
      noObligatoriosFaltantes += evalMediciones.filter(
        (m) => !CAMPOS_OBLIGATORIOS_CLAVES.includes(m.spec.clave) && m.input.valor === "",
      ).length;
      const descBase = "Agregada al listado de producción capturada.";
      toast.success(`Muestra guardada (${folioToast})`, {
        description:
          noObligatoriosFaltantes > 0
            ? `${descBase} Faltaron (${noObligatoriosFaltantes}) datos no obligatorios.`
            : descBase,
        duration: 5000,
      });
      setMuestraRecienId(res.muestra_id);
      setTimeout(() => {
        document.getElementById("produccion-capturada")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 150);
      setTimeout(() => setMuestraRecienId(null), 4000);
      // Construir snapshot de etiqueta antes de limpiar el formulario
      const fechaMuestreo = new Date(horaMuestreo);
      const fueraSpecAlguno = variablesFueraDeSpec.length > 0;
      const etiqueta: EtiquetaData = {
        muestraId: res.muestra_id,
        folio:
          `${maquina.codigo}-${fechaMuestreo.toISOString().slice(0, 10)}-${numeroRollo || "SN"}`.replace(
            /\s+/g,
            "",
          ),
        fecha: fechaMuestreo.toLocaleDateString("es-MX"),
        numeroRollo: numeroRollo || "",
        maquinaCodigo: maquina.codigo,
        maquinaNombre: maquina.nombre,
        productoCodigo: producto.codigo,
        productoNombre: producto.nombre,
        observacionesGenerales: observaciones,
        turno,
        jefeMaquina,
        operador,
        prensero,
        analista,
        mediciones: evalMediciones.map((m) => ({
          clave: m.spec.clave,
          etiqueta: m.spec.etiqueta,
          valor: m.input.valor !== "" && Number.isFinite(m.num) ? m.num : null,
          unidad: m.spec.unidad,
          min: m.spec.min_valor,
          max: m.spec.max_valor,
          fueraSpec: m.estado === "no_conforme" || m.estado === "fuera_rango_critico",
        })),
        estatusLiberacion: estatusLiberacion || null,
        defectos,
        estatus:
          estatusLiberacion === "L"
            ? "LIBERADO"
            : estatusLiberacion === "NC"
              ? "NO CONFORME"
              : estatusLiberacion === "C"
                ? "CONDICIONAL"
                : fueraSpecAlguno
                  ? "NO CONFORME"
                  : "CONFORME",
      };
      setUltimaEtiqueta(etiqueta);
      setMediciones((prev) => {
        const r: MedicionInputState = {};
        Object.keys(prev).forEach((k) => {
          r[k] = { valor: "" };
        });
        return r;
      });
      setJefeMaquina("");
      setOperador("");
      setPrensero("");
      setAnalista("");
      setObservaciones("");
      setNumeroRollo("");
      setEstatusLiberacion("");
      setDefectos([]);
      setHoraMuestreo(toLocalDateTimeInputValue(new Date()));
    },
    onError: (err: Error) =>
      toast.error("No se pudo guardar la captura", { description: err.message, duration: 7000 }),
  });

  async function handlePrintEtiqueta() {
    if (!ultimaEtiqueta) return;
    try {
      await printEtiquetaLiberacion(ultimaEtiqueta);
      void auditAction("etiqueta", `Impresión etiqueta FOR-CAL-04 ${ultimaEtiqueta.folio ?? ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo abrir la etiqueta");
    }
  }

  // ---- Listado de muestras recientes del capturista ----
  const misMuestrasQuery = useQuery({ ...misMuestrasQO, enabled: hasAuthToken, retry: false });

  // ---- Cumplimiento del turno+máquina actual (calculado en servidor) ----
  const cumplimientoRange = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString() };
  }, []);
  const cumplimientoQuery = useQuery({
    queryKey: ["qc", "cumplimiento", maquina.id, turno, cumplimientoRange.from],
    queryFn: () =>
      getCumplimientoIndicador({
        data: {
          maquina_id: maquina.id,
          turno,
          from: cumplimientoRange.from,
          to: cumplimientoRange.to,
        },
      }),
    enabled: hasAuthToken && !!maquina.id,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  async function imprimirEtiquetaMuestra(muestra: MuestraReciente) {
    try {
      const data = buildEtiquetaFromMuestra(muestra);
      await printEtiquetaLiberacion(data);
      void auditAction(
        "etiqueta",
        `Reimpresión etiqueta FOR-CAL-04 folio ${muestra.id.slice(0, 8)}`,
        muestra.id,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo abrir la etiqueta");
    }
  }

  const CAMPOS_OBLIGATORIOS_CLAVES = [
    "blancuraR457",
    "blancuraA",
    "blancuraB",
    "pesoBase",
    "diametro",
    "peso",
  ];

  function clampNumberString(value: string, min: number, max: number): string {
    const trimmed = value.trim();
    if (trimmed === "" || trimmed === "-" || /\.$/.test(trimmed)) return value;
    const num = Number(trimmed);
    if (!Number.isFinite(num)) return value;
    return String(Math.max(min, Math.min(max, num)));
  }

  function validar(modo: "borrador" | "envio"): { error: string | null; faltantes: number } {
    if (!spec) return { error: "Selecciona un producto con especificación vigente", faltantes: 0 };
    if (!canCapture) return { error: "Sin permiso de captura", faltantes: 0 };
    if (!auth.user?.id) return { error: "Sesión inválida — vuelve a iniciar sesión", faltantes: 0 };
    if (numeroRollo.trim() && !ROLLO_REGEX.test(numeroRollo.trim()))
      return { error: "El número de rollo solo puede usar letras, números y guion", faltantes: 0 };

    if (crepadoPct.trim() !== "" && (Number(crepadoPct) < 0 || Number(crepadoPct) > 100))
      return { error: "El campo % Crepado debe estar entre 0 y 100", faltantes: 0 };
    // Cumplimiento se calcula automáticamente desde la base de datos.
    if (porcentajeRupturasPct.trim() !== "" && (Number(porcentajeRupturasPct) < 0 || Number(porcentajeRupturasPct) > 100))
      return { error: "El campo Porcentaje de rupturas debe estar entre 0 y 100", faltantes: 0 };

    let faltantes = 0;
    if (modo === "envio") {
      if (!numeroRollo.trim()) faltantes += 1;
      faltantes += evalMediciones.filter(
        (m) => CAMPOS_OBLIGATORIOS_CLAVES.includes(m.spec.clave) && m.input.valor === "",
      ).length;
    }

    return { error: null, faltantes };
  }

  function handleSubmit(modo: "borrador" | "envio") {
    const { error, faltantes } = validar(modo);
    if (error) {
      toast.error(error);
      return;
    }
    if (modo === "envio" && faltantes > 0) {
      toast(`Te faltaron de capturar ${faltantes} campos obligatorios.`, { duration: 2000 });
      return;
    }
    if (!spec) return;

    const variablesSnapshot: Record<string, unknown> = {};
    variables.forEach((v) => {
      variablesSnapshot[v.variable_id] = {
        min: v.min_valor,
        obj: v.objetivo,
        max: v.max_valor,
        unidad: v.unidad,
        etiqueta: v.etiqueta,
      };
    });

    mutation.mutate({
      data: {
        orden_id: null,
        especificacion_id: spec.spec.id,
        especificacion_version: spec.spec.version,
        planta_id: maquina.planta_id,
        maquina_id: maquina.id,
        producto_id: producto.producto_id,
        turno,
        operario_id: auth.user!.id,
        numero_rollo: numeroRollo.trim(),
        jefe_maquina: jefeMaquina.trim() || undefined,
        operador: operador.trim() || undefined,
        prensero: prensero.trim() || undefined,
        analista: analista.trim() || undefined,
        velocidad_maquina:
          velocidadMaquina.trim() === "" ? null : Number(velocidadMaquina),
        velocidad_enrollador:
          velocidadEnrollador.trim() === "" ? null : Number(velocidadEnrollador),
        crepado_pct: crepadoPct.trim() === "" ? null : Number(crepadoPct),
        // Cumplimiento se calcula desde la BD; nunca capturado a mano.
        cumplimiento_pct: null,
        porcentaje_rupturas_pct:
          porcentajeRupturasPct.trim() === "" ? null : Number(porcentajeRupturasPct),
        destino: destino.trim() === "" ? null : destino.trim(),
        estatus_liberacion: estatusLiberacion || undefined,
        defectos,
        tipo_muestreo: "por_rollo" as const,
        hora_muestreo: horaMuestreo ? new Date(horaMuestreo).toISOString() : undefined,
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

  const puedeEnviar = !isBlocked && !mutation.isPending && !!spec;

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
            {!canCapture && (
              <Badge variant="destructive" className="gap-1">
                <Lock className="h-3 w-3" /> Sin permiso de captura
              </Badge>
            )}
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">A. Turno, máquina y producto</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-base">Turno</Label>
              <Select value={turno} onValueChange={(v) => setTurno(v as "1" | "2" | "3")}>
                <SelectTrigger className="h-11 text-base">
                  <SelectValue placeholder="Selecciona turno" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">
                    Turno 1 · {settings?.turno1_inicio ?? "07:00"} –{" "}
                    {settings?.turno1_fin ?? "15:00"}
                  </SelectItem>
                  <SelectItem value="2">
                    Turno 2 · {settings?.turno2_inicio ?? "15:00"} –{" "}
                    {settings?.turno2_fin ?? "23:00"}
                  </SelectItem>
                  <SelectItem value="3">
                    Turno 3 · {settings?.turno3_inicio ?? "23:00"} –{" "}
                    {settings?.turno3_fin ?? "07:00"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-base">Máquina</Label>
              <Select value={maquinaId} onValueChange={setMaquinaId}>
                <SelectTrigger className="h-11 text-base">
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
              <Label className="text-base">Producto</Label>
              <Select value={productoId} onValueChange={setProductoId}>
                <SelectTrigger className="h-11 text-base">
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
            <div className="space-y-1.5">
              <Label htmlFor="vel-maq" className="text-base">
                Vel. Máquina{" "}
                <span className="text-muted-foreground font-normal">(m/min · opcional)</span>
              </Label>
              <Input
                id="vel-maq"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                placeholder="—"
                value={velocidadMaquina}
                onChange={(e) => setVelocidadMaquina(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vel-enr" className="text-base">
                Vel. Enrollador{" "}
                <span className="text-muted-foreground font-normal">(m/min · opcional)</span>
              </Label>
              <Input
                id="vel-enr"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                placeholder="—"
                value={velocidadEnrollador}
                onChange={(e) => setVelocidadEnrollador(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crepado" className="text-base">
                % Crepado{" "}
                <span className="text-muted-foreground font-normal">(% · opcional)</span>
              </Label>
              <Input
                id="crepado"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                max={100}
                placeholder="—"
                value={crepadoPct}
                onChange={(e) => setCrepadoPct(clampNumberString(e.target.value, 0, 100))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cumplimiento" className="text-base">
                Cumplimiento{" "}
                <span className="text-muted-foreground font-normal">
                  (calculado automáticamente)
                </span>
              </Label>
              <div
                id="cumplimiento"
                aria-readonly="true"
                className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm font-semibold tabular-nums"
                title={`Turno ${turno} · ${maquina.codigo}`}
              >
                {cumplimientoQuery.isLoading
                  ? "Calculando…"
                  : (cumplimientoQuery.data?.texto ?? "0 liberados de 0 capturados (0%)")}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Turno {turno} · {maquina.codigo} · datos reales de hoy. No editable.
              </p>
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
              <CardTitle className="text-base font-semibold">B. Personal del turno</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="jefe" className="text-base">
                  Jefe de Máquina
                </Label>
                <Input
                  id="jefe"
                  maxLength={120}
                  value={jefeMaquina}
                  onChange={(e) => setJefeMaquina(e.target.value.toUpperCase())}
                  placeholder="NOMBRE"
                  className="uppercase"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="oper" className="text-base">
                  Operador
                </Label>
                <Input
                  id="oper"
                  maxLength={120}
                  value={operador}
                  onChange={(e) => setOperador(e.target.value.toUpperCase())}
                  placeholder="NOMBRE"
                  className="uppercase"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prens" className="text-base">
                  Prensero
                </Label>
                <Input
                  id="prens"
                  maxLength={120}
                  value={prensero}
                  onChange={(e) => setPrensero(e.target.value.toUpperCase())}
                  placeholder="NOMBRE"
                  className="uppercase"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="anal" className="text-base">
                  Analista
                </Label>
                <Input
                  id="anal"
                  maxLength={120}
                  value={analista}
                  onChange={(e) => setAnalista(e.target.value.toUpperCase())}
                  placeholder="NOMBRE"
                  className="uppercase"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {spec && (
          <Card className={cn(isBlocked && "opacity-60 pointer-events-none")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">C. Datos de la muestra</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="rollo" className="text-base">
                  Número de rollo{" "}
                  <span className="text-muted-foreground font-normal">
                    (letras, números o guion)
                  </span>
                </Label>
                <Input
                  id="rollo"
                  type="text"
                  inputMode="text"
                  placeholder="4438-6"
                  pattern="[A-Za-z0-9-]{1,30}"
                  value={numeroRollo}
                  onChange={(e) => setNumeroRollo(e.target.value)}
                  className={cn(
                    "h-11 text-base",
                    numeroRollo && !ROLLO_REGEX.test(numeroRollo.trim()) && "border-destructive",
                  )}
                />
                {numeroRollo && !ROLLO_REGEX.test(numeroRollo.trim()) && (
                  <p className="text-[11px] text-destructive">
                    Usa máximo 30 caracteres: letras, números y guion.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hora" className="text-base">
                  Hora de muestreo
                </Label>
                <Input
                  id="hora"
                  type="datetime-local"
                  className="h-11 text-base"
                  value={horaMuestreo}
                  onChange={(e) => setHoraMuestreo(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-base">Especificación vigente</Label>
                <div className="flex items-center gap-2 h-11 px-3 rounded-md border border-border bg-muted text-base">
                  <Badge variant="secondary">v{spec.spec.version}</Badge>
                  <span className="text-muted-foreground text-sm">
                    {variables.length} variables
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {variablesFueraDeSpec.length > 0 && !isBlocked && (
          <Alert
            variant={hayCritico ? "destructive" : "default"}
            className={cn(
              !hayCritico &&
                "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
            )}
          >
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {hayCritico
                ? "Mediciones críticas fuera de especificación"
                : "Mediciones fuera de especificación"}
            </AlertTitle>
            <AlertDescription>
              {variablesFueraDeSpec.length} variable(s) fuera de spec (
              {variablesFueraDeSpec.map((m) => m.spec.etiqueta).join(", ")}). Calidad deberá evaluar
              esta muestra.
            </AlertDescription>
          </Alert>
        )}

        {spec && (
          <Card className={cn(isBlocked && "opacity-60 pointer-events-none")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">D. Mediciones por variable</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {/* Desktop / tablet landscape: tabla clásica */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-lg min-w-[680px]">
                  <thead className="text-base uppercase tracking-wide text-muted-foreground bg-muted/40">
                    <tr className="border-b">
                      <th className="py-3 px-3 text-left font-semibold w-[30%]">Variable</th>
                      <th className="py-3 px-2 text-right font-semibold w-16">Min</th>
                      <th className="py-3 px-2 text-right font-semibold w-20">Objetivo</th>
                      <th className="py-3 px-2 text-right font-semibold w-16">Max</th>
                      <th className="py-3 px-3 text-left font-semibold w-[26%]">Valor</th>
                      <th className="py-3 px-3 text-left font-semibold w-[140px]">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evalMediciones.map(({ spec: vs, input, estado }, idx) => (
                      <tr
                        key={vs.variable_id}
                        className={`border-b last:border-0 transition-colors hover:bg-primary/10 ${idx % 2 === 0 ? "bg-primary/15" : "bg-background"}`}
                      >
                        <td className="py-4 px-3 align-middle">
                          <div className="font-semibold text-lg leading-snug">{vs.etiqueta}</div>
                          <div className="text-sm text-muted-foreground">{vs.unidad}</div>
                        </td>
                        <td className="py-4 px-2 text-lg text-right tabular-nums text-muted-foreground align-middle">
                          {vs.min_valor}
                        </td>
                        <td className="py-4 px-2 text-lg text-right tabular-nums font-semibold text-foreground align-middle">
                          {vs.objetivo}
                        </td>
                        <td className="py-4 px-2 text-lg text-right tabular-nums text-muted-foreground align-middle">
                          {vs.max_valor}
                        </td>
                        <td className="py-4 px-3 align-middle">
                          {vs.clave === "uniones" ? (
                            <Select
                              disabled={isBlocked}
                              value={input.valor}
                              onValueChange={(val) =>
                                setMediciones((prev) => ({
                                  ...prev,
                                  [vs.variable_id]: { ...prev[vs.variable_id], valor: val },
                                }))
                              }
                            >
                              <SelectTrigger
                                data-capture-field
                                onFocus={(e) => scrollFieldIntoView(e.currentTarget)}
                                className="h-12 text-lg font-bold text-capture w-full"
                              >
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent>
                                {["0", "1", "2", "3", "4", "5"].map((o) => (
                                  <SelectItem key={o} value={o}>
                                    {o === "5" ? "5+" : o}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : vs.clave === "relMDCD" ? (
                            <Input
                              type="text"
                              readOnly
                              tabIndex={-1}
                              value={input.valor === "" ? "—" : input.valor}
                              className="h-12 text-lg font-bold text-capture w-full bg-muted/40 cursor-not-allowed"
                              title="Calculado automáticamente: Tensión seca MD ÷ Tensión seca CD"
                            />
                          ) : (
                            <Input
                              type="number"
                              step={vs.clave === "peso" ? 1 : 0.1}
                              inputMode="decimal"
                              disabled={isBlocked}
                              value={input.valor}
                              data-capture-field
                              onFocus={(e) => scrollFieldIntoView(e.currentTarget)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  focusNextCaptureField(e.currentTarget);
                                }
                              }}
                              onChange={(e) =>
                                setMediciones((prev) => ({
                                  ...prev,
                                  [vs.variable_id]: {
                                    ...prev[vs.variable_id],
                                    valor: e.target.value,
                                  },
                                }))
                              }
                              className="h-12 text-lg font-bold text-capture w-full"
                              placeholder="—"
                            />
                          )}
                        </td>
                        <td className="py-4 px-3 align-middle">
                          <EstadoMedicionBadge estado={estado} />
                        </td>
                      </tr>
                    ))}
                    <tr className="border-b last:border-0 bg-background">
                      <td className="py-4 px-3 align-middle">
                        <div className="font-semibold text-lg leading-snug">Porcentaje de rupturas</div>
                        <div className="text-sm text-muted-foreground">%</div>
                      </td>
                      <td className="py-4 px-2 text-lg text-right tabular-nums text-muted-foreground align-middle">0</td>
                      <td className="py-4 px-2 text-lg text-right tabular-nums font-semibold text-foreground align-middle">—</td>
                      <td className="py-4 px-2 text-lg text-right tabular-nums text-muted-foreground align-middle">100</td>
                      <td className="py-4 px-3 align-middle" colSpan={2}>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min={0}
                          max={100}
                          disabled={isBlocked}
                          value={porcentajeRupturasPct}
                          onChange={(e) => setPorcentajeRupturasPct(clampNumberString(e.target.value, 0, 100))}
                          className="h-12 text-lg font-bold text-capture w-full"
                          placeholder="0 - 100"
                        />
                      </td>
                    </tr>
                    <tr className="border-b last:border-0 bg-primary/15">
                      <td className="py-4 px-3 align-middle">
                        <div className="font-semibold text-lg leading-snug">Destino</div>
                        <div className="text-sm text-muted-foreground">texto</div>
                      </td>
                      <td className="py-4 px-2 text-lg text-right tabular-nums text-muted-foreground align-middle">—</td>
                      <td className="py-4 px-2 text-lg text-right tabular-nums font-semibold text-foreground align-middle">—</td>
                      <td className="py-4 px-2 text-lg text-right tabular-nums text-muted-foreground align-middle">—</td>
                      <td className="py-4 px-3 align-middle" colSpan={2}>
                        <Input
                          type="text"
                          maxLength={200}
                          disabled={isBlocked}
                          value={destino}
                          onChange={(e) => setDestino(e.target.value)}
                          className="h-12 text-lg font-bold text-capture w-full"
                          placeholder="Captura usuario"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Mobile / tablet portrait: tarjetas por variable */}
              <div className="md:hidden space-y-4 p-4">
                {evalMediciones.map(({ spec: vs, input, estado }, idx) => (
                  <div
                    key={vs.variable_id}
                    className={`rounded-xl border border-border p-5 shadow-sm ${idx % 2 === 0 ? "bg-primary/15" : "bg-card"}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-4">
                      <div>
                        <div className="font-semibold text-base">{vs.etiqueta}</div>
                        <div className="text-sm text-muted-foreground">{vs.unidad}</div>
                      </div>
                      <EstadoMedicionBadge estado={estado} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                      <div className="rounded-md bg-muted/50 px-2 py-2">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">
                          Min
                        </div>
                        <div className="text-base font-medium tabular-nums text-muted-foreground">
                          {vs.min_valor}
                        </div>
                      </div>
                      <div className="rounded-md bg-primary/15 px-2 py-2 border border-primary/20">
                        <div className="text-xs uppercase tracking-wide text-primary/70">
                          Objetivo
                        </div>
                        <div className="text-base font-bold tabular-nums text-primary">
                          {vs.objetivo}
                        </div>
                      </div>
                      <div className="rounded-md bg-muted/50 px-2 py-2">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">
                          Max
                        </div>
                        <div className="text-base font-medium tabular-nums text-muted-foreground">
                          {vs.max_valor}
                        </div>
                      </div>
                    </div>
                    {vs.clave === "uniones" ? (
                      <Select
                        disabled={isBlocked}
                        value={input.valor}
                        onValueChange={(val) =>
                          setMediciones((prev) => ({
                            ...prev,
                            [vs.variable_id]: { ...prev[vs.variable_id], valor: val },
                          }))
                        }
                      >
                        <SelectTrigger
                          data-capture-field
                          onFocus={(e) => scrollFieldIntoView(e.currentTarget)}
                          className="h-12 text-lg font-bold text-capture w-full"
                        >
                          <SelectValue placeholder="Capturar valor" />
                        </SelectTrigger>
                        <SelectContent>
                          {["0", "1", "2", "3", "4", "5"].map((o) => (
                            <SelectItem key={o} value={o}>
                              {o === "5" ? "5+" : o}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : vs.clave === "relMDCD" ? (
                      <Input
                        type="text"
                        readOnly
                        tabIndex={-1}
                        value={input.valor === "" ? "—" : input.valor}
                        className="h-12 text-lg font-bold text-capture w-full bg-muted/40 cursor-not-allowed"
                        title="Calculado automáticamente: Tensión seca MD ÷ Tensión seca CD"
                      />
                    ) : (
                      <Input
                        type="number"
                        step={vs.clave === "peso" ? 1 : 0.1}
                        inputMode="decimal"
                        disabled={isBlocked}
                        value={input.valor}
                        data-capture-field
                        onFocus={(e) => scrollFieldIntoView(e.currentTarget)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            focusNextCaptureField(e.currentTarget);
                          }
                        }}
                        onChange={(e) =>
                          setMediciones((prev) => ({
                            ...prev,
                            [vs.variable_id]: { ...prev[vs.variable_id], valor: e.target.value },
                          }))
                        }
                        className="h-12 text-lg font-bold text-capture w-full"
                        placeholder="Capturar valor"
                      />
                    )}
                  </div>
                ))}
                <div className="rounded-xl border border-border p-5 shadow-sm bg-card">
                  <div className="mb-3">
                    <div className="font-semibold text-base">Porcentaje de rupturas</div>
                    <div className="text-sm text-muted-foreground">%</div>
                  </div>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={0}
                    max={100}
                    disabled={isBlocked}
                    value={porcentajeRupturasPct}
                    onChange={(e) => setPorcentajeRupturasPct(clampNumberString(e.target.value, 0, 100))}
                    className="h-12 text-lg font-bold text-capture w-full"
                    placeholder="0 - 100"
                  />
                </div>
                <div className="rounded-xl border border-border p-5 shadow-sm bg-primary/15">
                  <div className="mb-3">
                    <div className="font-semibold text-base">Destino</div>
                    <div className="text-sm text-muted-foreground">texto</div>
                  </div>
                  <Input
                    type="text"
                    maxLength={200}
                    disabled={isBlocked}
                    value={destino}
                    onChange={(e) => setDestino(e.target.value)}
                    className="h-12 text-lg font-bold text-capture w-full"
                    placeholder="Captura usuario"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {spec && (
          <Card className={cn(isBlocked && "opacity-60 pointer-events-none")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                F. Cierre — Estatus de liberación y defectos
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-base">Estatus de liberación</Label>
                <Select
                  value={estatusLiberacion}
                  onValueChange={(v) => setEstatusLiberacion(v as "" | "L" | "NC" | "C")}
                >
                  <SelectTrigger className="h-11 text-base">
                    <SelectValue placeholder="Selecciona estatus" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="L">L — Liberado</SelectItem>
                    <SelectItem value="NC">NC — No Conforme</SelectItem>
                    <SelectItem value="C">C — Condicional</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Si no se elige, se calcula automáticamente según las mediciones.
                </p>
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label className="text-base">Defectos observados</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {DEFECTOS_OPCIONES.map((d) => (
                    <label
                      key={d}
                      className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm cursor-pointer hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={defectos.includes(d)}
                        onCheckedChange={() => toggleDefecto(d)}
                      />
                      <span>{d}</span>
                    </label>
                  ))}
                </div>
                {defectos.includes("Otro") && (
                  <p className="text-[11px] text-muted-foreground">
                    Describe el detalle de "Otro" en el campo de observaciones generales (sección
                    C).
                  </p>
                )}
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
                <strong>{ultimaEtiqueta.estatus}</strong>. Imprime la etiqueta de liberación para el
                rollo.
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
          <div className="flex justify-end sticky bottom-0 bg-background/95 backdrop-blur py-3 border-t z-10">
            <Button
              size="lg"
              className={`text-base font-semibold transition-colors ${
                puedeEnviar
                  ? "bg-success text-success-foreground hover:bg-success/90 shadow-lg shadow-success/30 animate-pulse"
                  : ""
              }`}
              disabled={!puedeEnviar}
              onClick={() => handleSubmit("envio")}
            >
              <CheckCircle2 className="mr-2 h-5 w-5" />
              {mutation.isPending ? "Validando..." : "Validar Captura"}
            </Button>
          </div>
        )}

        {/* E. Producción capturada recientemente */}
        <Card id="produccion-capturada">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">
              E. Producción capturada recientemente
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {misMuestrasQuery.data?.length ?? 0} muestras
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            {misMuestrasQuery.isLoading ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">Cargando…</div>
            ) : !misMuestrasQuery.data || misMuestrasQuery.data.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                Aún no has capturado muestras. Cuando envíes una a revisión aparecerá aquí con su
                botón para reimprimir la etiqueta con código QR.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40">
                    <tr className="border-b">
                      <th className="py-2.5 px-3 text-left font-semibold">Fecha</th>
                      <th className="py-2.5 px-3 text-left font-semibold">Máquina</th>
                      <th className="py-2.5 px-3 text-left font-semibold">Producto</th>
                      <th className="py-2.5 px-3 text-right font-semibold">Rollo</th>
                      <th className="py-2.5 px-3 text-left font-semibold">Estatus</th>
                      <th className="py-2.5 px-3 text-right font-semibold">Etiqueta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {misMuestrasQuery.data.map((m) => {
                      // Estatus EFECTIVO — el badge respeta dictamen del Gerente
                      // de Calidad si está autorizado; de lo contrario el NC
                      // capturado o derivado de mediciones se mantiene
                      // pegajoso hasta que Gerencia libere.
                      const eff = getEffectiveStatus(
                        m as Parameters<typeof getEffectiveStatus>[0],
                      );
                      const fecha = new Date(m.hora_muestreo || m.capturado_at).toLocaleString(
                        "es-MX",
                        {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      );
                      return (
                        <tr
                          key={m.id}
                          className={cn(
                            "border-b last:border-0 hover:bg-muted/20 transition-colors",
                            muestraRecienId === m.id && "bg-emerald-500/15 animate-pulse",
                          )}
                        >
                          <td className="py-2.5 px-3 align-middle whitespace-nowrap text-xs tabular-nums">
                            {fecha}
                          </td>
                          <td className="py-2.5 px-3 align-middle">
                            <span className="font-mono text-xs">{m.maquinas?.codigo ?? "—"}</span>
                          </td>
                          <td className="py-2.5 px-3 align-middle">
                            <span className="font-mono text-xs mr-2">
                              {m.productos?.codigo ?? ""}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {m.productos?.nombre ?? ""}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 align-middle text-right tabular-nums">
                            {m.numero_rollo ?? "—"}
                          </td>
                          <td className="py-2.5 px-3 align-middle">
                            {eff.key === "NO_CONFORME" ? (
                              <Badge variant="destructive" className="gap-1" title={eff.lockedNoConforme ? "Bloqueado — requiere liberación del Gerente de Calidad" : undefined}>
                                <AlertTriangle className="h-3 w-3" /> No conforme
                              </Badge>
                            ) : eff.key === "LIBERADO" ? (
                              <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/40 gap-1 hover:bg-emerald-500/20">
                                <CheckCircle2 className="h-3 w-3" /> Liberado
                              </Badge>
                            ) : eff.key === "CONCESION" ? (
                              <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/40 gap-1 hover:bg-amber-500/20">
                                <CheckCircle2 className="h-3 w-3" /> Concesión
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/40 gap-1 hover:bg-emerald-500/20">
                                <CheckCircle2 className="h-3 w-3" /> Conforme
                              </Badge>
                            )}
                          </td>
                          <td className="py-2.5 px-3 align-middle text-right">
                            <div className="flex justify-end gap-2">
                              {puedeLiberar && (
                                <Button
                                  size="sm"
                                  variant={eff.key === "NO_CONFORME" ? "default" : "outline"}
                                  onClick={() => {
                                    setLiberarMuestra(m);
                                    setLiberarDictamen("liberada");
                                    setLiberarObservaciones("");
                                  }}
                                  title="Cambiar estatus (Gerente de Calidad)"
                                >
                                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                                  {eff.key === "NO_CONFORME" ? "Liberar" : "Cambiar estatus"}
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => imprimirEtiquetaMuestra(m)}
                              >
                                <Printer className="mr-1.5 h-4 w-4" /> Imprimir
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Diálogo: Cambio de estatus por Gerente de Calidad */}
        <Dialog
          open={!!liberarMuestra}
          onOpenChange={(open) => {
            if (!open) {
              setLiberarMuestra(null);
              setLiberarObservaciones("");
            }
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Cambiar estatus del rollo</DialogTitle>
              <DialogDescription>
                Rollo <strong>{liberarMuestra?.numero_rollo ?? "—"}</strong> ·{" "}
                {liberarMuestra?.maquinas?.codigo ?? "—"} ·{" "}
                {liberarMuestra?.productos?.codigo ?? ""} {liberarMuestra?.productos?.nombre ?? ""}.
                Tu usuario, fecha y observaciones quedarán registrados como evidencia en auditoría.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Dictamen</Label>
                <Select
                  value={liberarDictamen}
                  onValueChange={(v) =>
                    setLiberarDictamen(v as "liberada" | "concesion" | "rechazada")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="liberada">Liberar (Conforme)</SelectItem>
                    <SelectItem value="concesion">Concesión (Condicional)</SelectItem>
                    <SelectItem value="rechazada">Rechazar (No conforme)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  Observaciones del Gerente de Calidad{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  value={liberarObservaciones}
                  onChange={(e) => setLiberarObservaciones(e.target.value)}
                  placeholder="Justifica el cambio de estatus (mínimo 10 caracteres). Esta evidencia queda en el historial."
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  {liberarObservaciones.trim().length}/10 caracteres mínimos.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setLiberarMuestra(null);
                  setLiberarObservaciones("");
                }}
              >
                Cancelar
              </Button>
              <Button
                disabled={
                  liberarMutation.isPending ||
                  liberarObservaciones.trim().length < 10 ||
                  !liberarMuestra
                }
                onClick={() => {
                  if (!liberarMuestra) return;
                  liberarMutation.mutate({
                    data: {
                      muestra_id: liberarMuestra.id,
                      dictamen: liberarDictamen,
                      motivo: liberarDictamen,
                      observaciones: liberarObservaciones.trim(),
                    },
                  });
                }}
              >
                {liberarMutation.isPending ? "Guardando..." : "Confirmar cambio"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

function EstadoMedicionBadge({ estado }: { estado: MedicionEstadoUI }) {
  if (estado === "pendiente")
    return (
      <Badge variant="outline" className="text-muted-foreground">
        —
      </Badge>
    );
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

type MuestraReciente = Awaited<ReturnType<typeof listMisMuestrasRecientes>>[number];

function buildEtiquetaFromMuestra(m: MuestraReciente): EtiquetaData {
  const fecha = new Date(m.hora_muestreo || m.capturado_at || new Date().toISOString());
  const codigoMaq = m.maquinas?.codigo ?? "MQ";
  const folio =
    `${codigoMaq}-${fecha.toISOString().slice(0, 10)}-${m.numero_rollo ?? "SN"}`.replace(
      /\s+/g,
      "",
    );
  const meds = (m.mediciones_calidad ?? []).map((md) => {
    const min = Number(md.min_snapshot);
    const max = Number(md.max_snapshot);
    const valor = Number(md.valor);
    return {
      clave: md.variable_clave ?? md.variables_calidad?.clave ?? "",
      etiqueta: md.variables_calidad?.etiqueta ?? md.variable_clave ?? "—",
      valor,
      unidad: md.variables_calidad?.unidad ?? "",
      min,
      max,
      fueraSpec: md.estado === "no_conforme" || md.estado === "fuera_rango_critico",
    };
  });
  // Estatus EFECTIVO — la etiqueta y el QR reflejan dictamen autorizado del
  // Gerente de Calidad; sin autorización, un NC capturado o derivado de
  // mediciones se MANTIENE en la etiqueta impresa y se preserva al reimprimir.
  const eff = getEffectiveStatus(m as Parameters<typeof getEffectiveStatus>[0]);
  const est = (m as { estatus_liberacion?: string | null }).estatus_liberacion ?? null;
  const defectos = ((m as { defectos?: string[] | null }).defectos ?? []) as string[];
  const estatus: EtiquetaData["estatus"] = toEtiquetaEstatus(eff.key);
  return {
    muestraId: m.id,
    folio,
    fecha: fecha.toLocaleDateString("es-MX"),
    numeroRollo: m.numero_rollo != null ? String(m.numero_rollo) : "",
    maquinaCodigo: codigoMaq,
    maquinaNombre: m.maquinas?.nombre ?? "",
    productoCodigo: m.productos?.codigo ?? "",
    productoNombre: m.productos?.nombre ?? "",
    observacionesGenerales: m.observaciones_generales ?? "",
    turno: (m as { turno?: string | null }).turno ?? null,
    jefeMaquina: (m as { jefe_maquina?: string | null }).jefe_maquina ?? null,
    operador: (m as { operador?: string | null }).operador ?? null,
    prensero: (m as { prensero?: string | null }).prensero ?? null,
    analista: (m as { analista?: string | null }).analista ?? null,
    mediciones: meds,
    estatusLiberacion: est as "L" | "NC" | "C" | null,
    defectos,
    estatus,
    autorizacion: (m as { autorizado_por?: string | null }).autorizado_por
      ? {
          dictamen: (m as { dictamen?: string }).dictamen ?? "",
          observaciones:
            (m as { dictamen_observaciones?: string | null }).dictamen_observaciones ?? "",
          motivo: (m as { dictamen_motivo?: string | null }).dictamen_motivo ?? null,
          autorizadoAt: (m as { autorizado_at?: string | null }).autorizado_at ?? null,
          rolAutorizador:
            (m as { rol_autorizador?: string | null }).rol_autorizador ?? null,
          autorizadoPor: (m as { autorizado_por?: string | null }).autorizado_por ?? null,
        }
      : null,
  };
}

