import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Camera, CheckCircle2, Loader2, RefreshCw, Upload, ImageIcon, ImagePlus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  listPesajes, firmarEvidencia, type PesajeBobina,
} from "@/lib/pesajes.functions";
import { fechaCortoMX, horaMX } from "@/lib/format";

export const Route = createFileRoute("/pesaje/bobina-madre")({
  head: () => ({
    meta: [
      { title: "Pesaje de Bobina Madre · Convertipap" },
      { name: "description", content: "Captura manual de pesaje de bobina madre con evidencia fotográfica" },
      { property: "og:title", content: "Pesaje de Bobina Madre · Convertipap" },
      { property: "og:description", content: "Captura manual de pesaje de bobina madre con evidencia fotográfica" },
    ],
  }),
  component: () => (
    <AppLayout title="Control de Pesaje · Bobina Madre">
      <PesajeBobinaPage />
    </AppLayout>
  ),
});

type Maquina = { id: string; codigo: string };

// Tara por máquina en kg (peso del eje que se descuenta del bruto).
const TARA_POR_MAQUINA: Record<string, number> = {
  "MP-04": 560,
  "MP-05": 750,
  "MP-06": 1160,
  "MP-07": 0,
};
function taraPorMaquina(codigo: string): number {
  return TARA_POR_MAQUINA[codigo] ?? 0;
}

function detectarOrigen(): "tablet_android" | "tablet_windows" | "navegador_web" {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/Android/i.test(ua)) return "tablet_android";
  if (/Windows/i.test(ua)) return "tablet_windows";
  return "navegador_web";
}

/**
 * Comprime una imagen manteniendo proporción, con lado más largo <= maxSide
 * y calidad JPEG configurable. Devuelve un File JPEG optimizado.
 */
async function comprimirImagen(file: File, maxSide = 1600, quality = 0.82): Promise<File> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  let w: number, h: number;
  let source: CanvasImageSource;
  if (bitmap) {
    w = bitmap.width;
    h = bitmap.height;
    source = bitmap;
  } else {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Imagen inválida"));
      el.src = URL.createObjectURL(file);
    });
    w = img.naturalWidth;
    h = img.naturalHeight;
    source = img;
  }
  if (!w || !h) throw new Error("La fotografía no tiene contenido válido.");
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const outW = Math.round(w * scale);
  const outH = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen.");
  ctx.drawImage(source, 0, 0, outW, outH);
  const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", quality));
  if (!blob) throw new Error("No se pudo comprimir la imagen.");
  return new File([blob], `pesaje-${Date.now()}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

function PesajeBobinaPage() {
  const qc = useQueryClient();

  // Formulario
  const [ordenSel, setOrdenSel] = useState<string>(""); // "", id o "__otro__"
  const [ordenOtro, setOrdenOtro] = useState("");
  const [numeroOrden, setNumeroOrden] = useState("");
  const [maquinaId, setMaquinaId] = useState<string>("");
  const [numeroRollo, setNumeroRollo] = useState("");
  const [pesoTexto, setPesoTexto] = useState<string>("");

  const [evidenciaFile, setEvidenciaFile] = useState<File | null>(null);
  const [evidenciaPreview, setEvidenciaPreview] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState(false);

  // Cámara en vivo
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [camaraError, setCamaraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Máquinas
  const maquinasQ = useQuery({
    queryKey: ["pesaje", "maquinas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maquinas")
        .select("id, codigo")
        .in("codigo", ["MP-04", "MP-05", "MP-06", "MP-07"])
        .eq("activo", true)
        .order("codigo");
      if (error) throw new Error(error.message);
      return (data ?? []) as Maquina[];
    },
    staleTime: 5 * 60_000,
  });

  const maqCodigo = useMemo(
    () => maquinasQ.data?.find((m) => m.id === maquinaId)?.codigo ?? "",
    [maquinasQ.data, maquinaId],
  );
  const sufijoMaq = useMemo(() => {
    const m = /(\d)$/.exec(maqCodigo);
    return m ? m[1] : "";
  }, [maqCodigo]);
  const baseRollo = useMemo(() => {
    if (!numeroRollo) return "";
    const m = /^(.*)-(\d)$/.exec(numeroRollo);
    return m ? m[1] : numeroRollo;
  }, [numeroRollo]);

  useEffect(() => {
    if (!sufijoMaq) return;
    setNumeroRollo((prev) => {
      if (!prev) return prev;
      const m = /^(.*)-(\d)$/.exec(prev);
      if (m) {
        if (m[2] !== sufijoMaq) return `${m[1]}-${sufijoMaq}`;
        return prev;
      }
      return `${prev}-${sufijoMaq}`;
    });
  }, [sufijoMaq]);

  // Órdenes activas
  const ordenesQ = useQuery({
    queryKey: ["pesaje", "ordenes-activas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordenes_produccion")
        .select("id, numero_orden")
        .eq("estado", "activa")
        .order("numero_orden");
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; numero_orden: string }[];
    },
    staleTime: 60_000,
  });

  const listar = useServerFn(listPesajes);
  const listaQ = useQuery({
    queryKey: ["pesajes", "lista"],
    queryFn: () => listar(),
    staleTime: 30_000,
  });

  const ordenIdSeleccionada = ordenSel && ordenSel !== "__otro__" ? ordenSel : null;
  const pesoBruto = useMemo(() => {
    const clean = pesoTexto.replace(",", ".").replace(/[^\d.]/g, "");
    const n = Number(clean);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [pesoTexto]);
  const tara = taraPorMaquina(maqCodigo);
  const pesoNeto = pesoBruto > 0 ? Math.max(0, pesoBruto - tara) : 0;

  const puedeMaquina = ordenSel !== ""; // orden seleccionada u "otro"
  const puedeRollo = !!maquinaId;
  const puedePeso = !!numeroRollo.trim() && !!baseRollo;
  const puedeRegistrar =
    !!maquinaId &&
    !!numeroRollo.trim() &&
    pesoBruto > 0 &&
    pesoBruto > tara &&
    !!evidenciaFile &&
    !registrando;

  function limpiarFoto() {
    if (evidenciaPreview) URL.revokeObjectURL(evidenciaPreview);
    setEvidenciaFile(null);
    setEvidenciaPreview(null);
  }

  function resetForm(keepMaquina = false) {
    setPesoTexto("");
    limpiarFoto();
    if (!keepMaquina) {
      setNumeroRollo("");
      setOrdenSel("");
      setOrdenOtro("");
      setNumeroOrden("");
    } else {
      setNumeroRollo("");
    }
  }

  // === Cámara en vivo ===
  async function abrirCamara() {
    setCamaraError(null);
    setCamaraAbierta(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamaraError("Este navegador no permite acceder a la cámara. Selecciona una fotografía desde el dispositivo.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (e) {
      const err = e as DOMException;
      let msg = "No fue posible iniciar la cámara.";
      if (err.name === "NotAllowedError" || err.name === "SecurityError") msg = "Permiso de cámara no concedido.";
      else if (err.name === "NotFoundError" || err.name === "OverconstrainedError") msg = "No se detectó una cámara disponible.";
      setCamaraError(msg);
    }
  }

  function cerrarCamara() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamaraAbierta(false);
    setCamaraError(null);
  }

  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (evidenciaPreview) URL.revokeObjectURL(evidenciaPreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function usarArchivo(file: File) {
    try {
      const optim = await comprimirImagen(file);
      if (evidenciaPreview) URL.revokeObjectURL(evidenciaPreview);
      const url = URL.createObjectURL(optim);
      setEvidenciaFile(optim);
      setEvidenciaPreview(url);
    } catch (e) {
      toast.error((e as Error).message || "La fotografía no es válida.");
    }
  }

  async function tomarFoto() {
    const video = videoRef.current;
    if (!video || !streamRef.current) return toast.error("La cámara aún no está lista.");
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return toast.error("La cámara aún no envía imagen. Espera un momento.");
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return toast.error("No se pudo capturar la imagen.");
    ctx.drawImage(video, 0, 0, w, h);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob((b) => r(b), "image/jpeg", 0.9));
    if (!blob) return toast.error("No se pudo generar la imagen.");
    const raw = new File([blob], `pesaje-${Date.now()}.jpg`, { type: "image/jpeg" });
    cerrarCamara();
    await usarArchivo(raw);
  }

  function seleccionarArchivo() {
    fileInputRef.current?.click();
  }

  async function registrar() {
    if (!puedeRegistrar) return;
    setRegistrando(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) throw new Error("La sesión del usuario ha vencido.");
      const uid = userData.user.id;

      const now = new Date();
      const y = now.getFullYear();
      const mo = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");
      const rolloSanit = numeroRollo.trim().replace(/[^A-Za-z0-9_-]/g, "_");
      const path = `${uid}/${maqCodigo || "SIN-MAQ"}/${y}/${mo}/${d}/${rolloSanit}_${y}${mo}${d}-${hh}${mm}${ss}.jpg`;

      const up = await supabase.storage
        .from("pesajes-evidencia")
        .upload(path, evidenciaFile!, { upsert: false, contentType: "image/jpeg" });
      if (up.error) {
        if (/duplicate/i.test(up.error.message)) throw new Error("Ya existe un registro para este número de rollo.");
        throw new Error(`No se pudo subir la evidencia fotográfica: ${up.error.message}`);
      }

      const origen = detectarOrigen();
      const payload = {
        maquina_id: maquinaId,
        maquina_codigo: maqCodigo,
        numero_rollo: numeroRollo.trim(),
        orden_produccion_id: ordenIdSeleccionada,
        numero_orden: numeroOrden.trim() || null,
        peso_bruto_kg: pesoBruto,
        peso_eje_kg: tara,
        peso_neto_kg: pesoNeto,
        evidencia_path: path,
        ocr_confianza: null as number | null,
        ocr_raw: { origen_dispositivo: origen, estado_procesamiento: "registrado", estado_ocr: "no_solicitado" },
        capturado_por: uid,
      };

      const { error: insErr } = await supabase.from("pesajes_bobina_madre").insert(payload);
      if (insErr) {
        // Limpieza best-effort de la evidencia huérfana si el INSERT falla.
        await supabase.storage.from("pesajes-evidencia").remove([path]).catch(() => {});
        if (/duplicate|unique/i.test(insErr.message)) throw new Error("Ya existe un registro para este número de rollo.");
        if (/permission|denied|rls/i.test(insErr.message)) throw new Error("No cuenta con permisos para registrar pesajes.");
        throw new Error(`No se pudo registrar el pesaje: ${insErr.message}`);
      }

      toast.success("Pesaje registrado correctamente");
      qc.invalidateQueries({ queryKey: ["pesajes"] });
      resetForm(true);
    } catch (e) {
      console.error("[pesaje] registrar", e);
      toast.error((e as Error).message || "No se pudo registrar el pesaje.");
    } finally {
      setRegistrando(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <header className="mb-4 flex items-center">
          <h2 className="text-lg font-semibold">Nuevo pesaje de bobina madre</h2>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          {/* 1. Orden de producción */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">1. Orden de producción (opcional)</label>
            <select
              className="min-h-[48px] w-full rounded-md border border-input bg-background px-3 py-2 text-base"
              value={ordenSel}
              onChange={(e) => {
                const v = e.target.value;
                setOrdenSel(v);
                if (v === "__otro__") setNumeroOrden(ordenOtro.trim());
                else if (v === "") setNumeroOrden("");
                else setNumeroOrden(ordenesQ.data?.find((x) => x.id === v)?.numero_orden ?? "");
                setMaquinaId("");
                setNumeroRollo("");
              }}
              disabled={ordenesQ.isLoading}
            >
              <option value="">Selecciona…</option>
              {ordenesQ.data?.map((o) => (
                <option key={o.id} value={o.id}>{o.numero_orden}</option>
              ))}
              <option value="__otro__">Otro (capturar manualmente)</option>
              <option value="__sin__">Sin orden (temporal)</option>
            </select>
            {ordenSel === "__otro__" && (
              <input
                className="mt-2 min-h-[48px] w-full rounded-md border border-input bg-background px-3 py-2 text-base"
                value={ordenOtro}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setOrdenOtro(v);
                  setNumeroOrden(v);
                }}
                placeholder="Número SAP"
              />
            )}
          </div>

          {/* 2. Máquina */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">2. Máquina *</label>
            <select
              className="min-h-[48px] w-full rounded-md border border-input bg-background px-3 py-2 text-base disabled:opacity-50"
              value={maquinaId}
              onChange={(e) => { setMaquinaId(e.target.value); setNumeroRollo(""); }}
              disabled={maquinasQ.isLoading || !puedeMaquina}
            >
              <option value="">Selecciona…</option>
              {maquinasQ.data?.map((m) => (
                <option key={m.id} value={m.id}>{m.codigo}</option>
              ))}
            </select>
            {!puedeMaquina && (
              <p className="mt-1 text-[11px] text-muted-foreground">Selecciona primero la Orden de producción.</p>
            )}
          </div>

          {/* 3. Número de rollo */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              3. N.º de rollo * <span className="text-[10px] font-normal">(sufijo automático)</span>
            </label>
            <div className="flex items-stretch gap-2">
              <input
                className="min-h-[48px] w-full rounded-md border border-input bg-background px-3 py-2 text-base disabled:opacity-50"
                value={baseRollo}
                onChange={(e) => {
                  const raw = e.target.value.toUpperCase().replace(/-\d$/, "").trim();
                  setNumeroRollo(raw ? (sufijoMaq ? `${raw}-${sufijoMaq}` : raw) : "");
                }}
                placeholder={maqCodigo ? `Ej. 2807-${sufijoMaq || "X"}` : "Selecciona máquina primero"}
                disabled={!puedeRollo}
                inputMode="text"
              />
              <span className="inline-flex min-w-[56px] items-center justify-center rounded-md border border-input bg-muted px-3 text-base font-semibold">
                -{maquinaId ? (sufijoMaq || "?") : "?"}
              </span>
            </div>
          </div>
        </div>

        {/* 4. Peso registrado */}
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">4. Peso registrado (bruto de báscula) *</label>
            <div className="flex items-stretch gap-2">
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                className="min-h-[52px] w-full rounded-md border border-input bg-background px-3 py-2 text-lg font-semibold disabled:opacity-50"
                value={pesoTexto}
                onChange={(e) => setPesoTexto(e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="Ej. 2450"
                disabled={!puedePeso}
              />
              <span className="inline-flex min-w-[56px] items-center justify-center rounded-md border border-input bg-muted px-3 text-base font-semibold">kg</span>
            </div>
            {maqCodigo && pesoBruto > 0 && (
              <div className="mt-2 grid grid-cols-3 gap-2 rounded-md bg-muted/50 p-3 text-center text-sm">
                <div><div className="text-[11px] text-muted-foreground">Bruto</div><div className="font-semibold">{pesoBruto} kg</div></div>
                <div><div className="text-[11px] text-muted-foreground">Eje ({maqCodigo})</div><div className="font-semibold">{tara} kg</div></div>
                <div className="rounded bg-amber-100 text-amber-900"><div className="text-[11px]">Neto</div><div className="font-bold">{pesoNeto} kg</div></div>
              </div>
            )}
            {pesoBruto > 0 && pesoBruto <= tara && (
              <p className="mt-1 text-xs text-destructive">El peso bruto debe ser mayor a la tara ({tara} kg).</p>
            )}
          </div>
        </div>

        {/* 5. Evidencia */}
        <div className="mt-5">
          <label className="mb-2 block text-xs font-medium text-muted-foreground">5. Evidencia fotográfica *</label>
          {!evidenciaPreview ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={abrirCamara}
                className="group flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-primary/40 bg-gradient-to-br from-primary/5 to-primary/10 p-6 text-center transition hover:border-primary hover:from-primary/10"
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/15 ring-8 ring-primary/5 group-hover:scale-110">
                  <Camera className="h-10 w-10 text-primary" strokeWidth={1.75} />
                </div>
                <div className="text-base font-semibold">Tomar fotografía</div>
                <div className="text-xs text-muted-foreground">Cámara trasera de la tablet</div>
              </button>
              <button
                type="button"
                onClick={seleccionarArchivo}
                className="group flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/30 p-6 text-center transition hover:border-primary hover:bg-muted/50"
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted ring-8 ring-muted/40 group-hover:scale-110">
                  <ImagePlus className="h-10 w-10 text-muted-foreground" strokeWidth={1.75} />
                </div>
                <div className="text-base font-semibold">Seleccionar fotografía</div>
                <div className="text-xs text-muted-foreground">Desde el dispositivo (respaldo)</div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) usarArchivo(f);
                  e.target.value = "";
                }}
              />
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-2xl border border-border bg-black/90 shadow-lg">
              <img src={evidenciaPreview} alt="Evidencia" className="max-h-[360px] w-full object-contain" />
              <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-success/90 px-3 py-1 text-[11px] font-medium text-white">
                <CheckCircle2 className="h-3.5 w-3.5" /> Fotografía lista
              </div>
              <div className="absolute bottom-3 right-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => { limpiarFoto(); abrirCamara(); }}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-xs font-medium text-foreground shadow-md hover:bg-white"
                >
                  <Camera className="h-4 w-4" /> Volver a tomar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Botón registrar */}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={registrar}
            disabled={!puedeRegistrar}
            className="inline-flex min-h-[52px] items-center gap-2 rounded-md bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow disabled:opacity-50"
          >
            {registrando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
            {registrando ? "Registrando pesaje…" : "Registrar pesaje"}
          </button>
          <button
            onClick={() => resetForm(false)}
            disabled={registrando}
            className="inline-flex min-h-[52px] items-center gap-2 rounded-md border border-border px-5 py-3 text-sm"
          >
            <RefreshCw className="h-4 w-4" /> Limpiar
          </button>
        </div>
      </section>

      {/* Modal cámara */}
      {camaraAbierta && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <div className="text-sm font-medium">Captura en vivo · display de la báscula</div>
            <button
              type="button"
              onClick={cerrarCamara}
              className="rounded-md border border-white/30 px-3 py-1.5 text-xs hover:bg-white/10"
            >
              Cancelar
            </button>
          </div>
          <div className="relative flex-1 overflow-hidden bg-black">
            <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-contain" />
            {camaraError && (
              <div className="absolute inset-x-4 top-4 space-y-3 rounded-md bg-destructive/90 px-4 py-3 text-sm text-white">
                <div>{camaraError}</div>
                <button
                  type="button"
                  onClick={() => { cerrarCamara(); seleccionarArchivo(); }}
                  className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-xs font-medium text-destructive"
                >
                  <ImagePlus className="h-4 w-4" /> Seleccionar fotografía desde el dispositivo
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center justify-center gap-4 bg-black px-4 py-5">
            <button
              type="button"
              onClick={tomarFoto}
              disabled={!!camaraError}
              className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-white text-black shadow-lg ring-4 ring-white/30 disabled:opacity-40"
              aria-label="Tomar foto"
            >
              <Camera className="h-7 w-7" />
            </button>
          </div>
        </div>
      )}

      <ListaPesajes lista={listaQ.data ?? []} loading={listaQ.isLoading} />
    </div>
  );
}

function ListaPesajes({ lista, loading }: { lista: PesajeBobina[]; loading: boolean }) {
  const firmar = useServerFn(firmarEvidencia);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold">Últimos pesajes</h3>
        <span className="text-xs text-muted-foreground">{lista.length} registros</span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Máquina</th>
              <th className="px-3 py-2">Rollo</th>
              <th className="px-3 py-2">Orden</th>
              <th className="px-3 py-2 text-right">Bruto</th>
              <th className="px-3 py-2 text-right">Neto</th>
              <th className="px-3 py-2">Evidencia</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Cargando…</td></tr>
            )}
            {!loading && lista.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Sin registros aún.</td></tr>
            )}
            {lista.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-3 py-2 whitespace-nowrap">
                  {fechaCortoMX(p.fecha_hora_pesaje)} {horaMX(p.fecha_hora_pesaje)}
                </td>
                <td className="px-3 py-2">{p.maquina_codigo}</td>
                <td className="px-3 py-2 font-medium">{p.numero_rollo}</td>
                <td className="px-3 py-2">{p.numero_orden ?? "—"}</td>
                <td className="px-3 py-2 text-right">{Number(p.peso_bruto_kg).toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-semibold text-amber-700">{Number(p.peso_neto_kg).toFixed(2)}</td>
                <td className="px-3 py-2">
                  <button
                    onClick={async () => {
                      try {
                        const { url } = await firmar({ data: { path: p.evidencia_path } });
                        setPreviewUrl(url);
                      } catch (e) { toast.error((e as Error).message); }
                    }}
                    className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                  >
                    <ImageIcon className="h-3.5 w-3.5" /> Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <img src={previewUrl} alt="Evidencia" className="max-h-[90vh] max-w-[90vw] rounded-md" />
        </div>
      )}
    </section>
  );
}
