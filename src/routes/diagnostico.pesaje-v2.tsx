// Ruta TEMPORAL de diagnóstico. NO productiva. NO enlazada desde menús.
// Único propósito: probar `analizar-peso-bobina-v2` en modo dryRun desde tablet.
// No modifica ningún módulo productivo. No inserta. No almacena fotografías.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Camera, Copy, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/diagnostico/pesaje-v2")({
  head: () => ({
    meta: [
      { title: "Diagnóstico de Pesaje V2 (temporal)" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: DiagnosticoPesajeV2Page,
});

const ADMIN_ROLES = new Set(["administrador", "gerente_general", "direccion"]);
const MAX_BYTES = 900 * 1024;
const MAX_SIDE = 1280;
const QUALITY_1 = 0.72;
const QUALITY_2 = 0.6;
const TIMEOUT_MS = 90_000;
const FN_NAME = "analizar-peso-bobina-v2";
const MAQUINAS = ["MP-04", "MP-05", "MP-06", "MP-07"] as const;

type Etapa = { etapa: string; ts: string; ms?: number; extra?: Record<string, unknown> };
type Clasificacion = "APROBADA" | "RECHAZADA" | "INCONCLUSA" | null;

function nowIso() { return new Date().toISOString(); }

async function comprimir(file: File, quality: number): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(file).catch(() => null);
  let w: number, h: number, src: CanvasImageSource;
  if (bmp) { w = bmp.width; h = bmp.height; src = bmp; }
  else {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = () => rej(new Error("Imagen inválida"));
      el.src = URL.createObjectURL(file);
    });
    w = img.naturalWidth; h = img.naturalHeight; src = img;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const dw = Math.round(w * scale), dh = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = dw; canvas.height = dh;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(src, 0, 0, dw, dh);
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => b ? res(b) : rej(new Error("toBlob falló")), "image/jpeg", quality),
  );
  return { blob, w: dw, h: dh };
}

function DiagnosticoPesajeV2Page() {
  const { loading, isAuthenticated, user, roles, profile } = useAuth();
  const navigate = useNavigate();
  const isAdmin = useMemo(() => roles.some((r) => ADMIN_ROLES.has(r)), [roles]);

  useEffect(() => {
    if (!loading && (!isAuthenticated || !isAdmin)) {
      const t = setTimeout(() => navigate({ to: "/" }), 2500);
      return () => clearTimeout(t);
    }
  }, [loading, isAuthenticated, isAdmin, navigate]);

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Cargando sesión…</div>;
  }
  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="max-w-lg mx-auto mt-16 p-6">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Acceso no autorizado</AlertTitle>
          <AlertDescription>
            Esta ruta de diagnóstico es exclusiva para administradores. Redirigiendo…
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  return <DiagnosticoUI userEmail={user?.email ?? ""} rolesTxt={roles.join(", ")} nombre={profile?.nombre ?? ""} />;
}

function DiagnosticoUI({ userEmail, rolesTxt, nombre }: { userEmail: string; rolesTxt: string; nombre: string }) {
  const [maquinaCodigo, setMaquinaCodigo] = useState<string>("");
  const [numeroRollo, setNumeroRollo] = useState("");
  const [numeroOrden, setNumeroOrden] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [origSize, setOrigSize] = useState(0);
  const [origW, setOrigW] = useState(0);
  const [origH, setOrigH] = useState(0);

  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<string>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef<number | null>(null);

  const [requestId, setRequestId] = useState<string>("");
  const [result, setResult] = useState<any>(null);
  const [errorCode, setErrorCode] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [classification, setClassification] = useState<Clasificacion>(null);
  const [clientMetrics, setClientMetrics] = useState<{
    startedAt?: string; endedAt?: string;
    compressedBytes?: number; compressedW?: number; compressedH?: number;
    compressionMs?: number; sendMs?: number; totalMs?: number;
    httpStatus?: number;
  }>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  const setStageTimed = (s: string) => setStage(s);

  const cleanImage = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFile(null);
    setOrigSize(0); setOrigW(0); setOrigH(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onPickFile = async (f: File | null) => {
    if (!f) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setOrigSize(f.size);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
    try {
      const bmp = await createImageBitmap(f);
      setOrigW(bmp.width); setOrigH(bmp.height);
    } catch { setOrigW(0); setOrigH(0); }
  };

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const limpiar = () => {
    cleanImage();
    setResult(null); setErrorCode(""); setErrorMsg(""); setClassification(null);
    setRequestId(""); setStage("idle"); setElapsedMs(0);
    setClientMetrics({});
  };

  const ejecutar = async () => {
    if (running) return;
    if (!file) { toast.error("Toma una fotografía primero."); return; }
    if (!maquinaCodigo) { toast.error("Selecciona la máquina."); return; }
    if (!numeroRollo.trim()) { toast.error("Captura el número de rollo."); return; }

    const rid = crypto.randomUUID();
    setRequestId(rid);
    setRunning(true); setResult(null); setErrorCode(""); setErrorMsg(""); setClassification(null);
    const startedAt = nowIso();
    const t0 = performance.now();
    setElapsedMs(0);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => setElapsedMs(Math.round(performance.now() - t0)), 250);

    try {
      // 1. Compresión
      setStageTimed("image_compression");
      const cStart = performance.now();
      let { blob, w, h } = await comprimir(file, QUALITY_1);
      if (blob.size > MAX_BYTES) {
        const r2 = await comprimir(file, QUALITY_2);
        blob = r2.blob; w = r2.w; h = r2.h;
      }
      const compressionMs = Math.round(performance.now() - cStart);
      if (blob.size > MAX_BYTES) {
        throw new DiagError("IMAGE_TOO_LARGE", `Imagen ${blob.size} bytes > ${MAX_BYTES}`);
      }
      if (blob.size <= 0) throw new DiagError("IMAGE_EMPTY", "Blob vacío");
      const jpegFile = new File([blob], `diag-${rid}.jpg`, { type: "image/jpeg" });
      setClientMetrics((m) => ({ ...m, startedAt, compressedBytes: blob.size, compressedW: w, compressedH: h, compressionMs }));

      // 2. Sesión
      setStageTimed("session_validation");
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new DiagError("AUTH_SESSION_MISSING", "Sesión no disponible");

      // 3. FormData
      const fd = new FormData();
      fd.append("file", jpegFile);
      fd.append("maquina_id", ""); // no productivo — usamos maquina_codigo
      fd.append("maquina_codigo", maquinaCodigo);
      fd.append("numero_rollo", numeroRollo.trim());
      if (numeroOrden.trim()) fd.append("numero_orden", numeroOrden.trim());
      fd.append("dryRun", "true");

      // 4. Envío directo con fetch (multipart estable) + AbortController
      setStageTimed("function_request_started");
      const supaUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const endpoint = `${supaUrl}/functions/v1/${FN_NAME}`;
      const ac = new AbortController();
      const to = window.setTimeout(() => ac.abort(), TIMEOUT_MS);
      const sendStart = performance.now();
      let resp: Response;
      try {
        resp = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: anonKey,
            "x-request-id": rid,
          },
          body: fd,
          signal: ac.signal,
        });
      } catch (e) {
        if ((e as Error).name === "AbortError") throw new DiagError("CLIENT_TIMEOUT", `Sin respuesta en ${TIMEOUT_MS}ms`);
        throw new DiagError("NETWORK_FETCH_FAILED", (e as Error).message);
      } finally { window.clearTimeout(to); }
      const sendMs = Math.round(performance.now() - sendStart);

      const endedAt = nowIso();
      const totalMs = Math.round(performance.now() - t0);
      const httpStatus = resp.status;
      setClientMetrics((m) => ({ ...m, sendMs, totalMs, endedAt, httpStatus }));

      let bodyJson: any = null;
      try { bodyJson = await resp.json(); } catch { /* noop */ }

      if (!resp.ok) {
        const code = bodyJson?.code
          ?? (resp.status === 401 ? "AUTH_SESSION_MISSING"
              : resp.status === 403 ? "ADMIN_ACCESS_REQUIRED"
              : resp.status === 413 ? "IMAGE_TOO_LARGE"
              : resp.status === 415 ? "IMAGE_INVALID_TYPE"
              : resp.status === 502 ? "OCR_REQUEST_FAILED"
              : "FUNCTION_HTTP_ERROR");
        throw new DiagError(code, bodyJson?.message ?? bodyJson?.error ?? `HTTP ${resp.status}`, bodyJson);
      }

      setResult(bodyJson);
      // Clasificación
      const c = clasificar(bodyJson, rid, httpStatus);
      setClassification(c);
      setStageTimed("response_sent");
    } catch (e) {
      const err = e instanceof DiagError ? e : new DiagError("FUNCTION_UNEXPECTED_RESPONSE", (e as Error).message);
      setErrorCode(err.code); setErrorMsg(err.message);
      setResult(err.payload ?? null);
      setClassification("RECHAZADA");
    } finally {
      if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
      setRunning(false);
    }
  };

  const copiarReporte = async () => {
    const nav = navigator;
    const rep = {
      hora: clientMetrics.startedAt,
      finalizado: clientMetrics.endedAt,
      requestId,
      clasificacion: classification,
      dispositivo: nav.userAgent,
      online: nav.onLine,
      httpStatus: clientMetrics.httpStatus,
      tamano_original_bytes: origSize,
      dimensiones_original: origW && origH ? `${origW}x${origH}` : null,
      tamano_comprimido_bytes: clientMetrics.compressedBytes,
      dimensiones_comprimido: clientMetrics.compressedW && clientMetrics.compressedH ? `${clientMetrics.compressedW}x${clientMetrics.compressedH}` : null,
      compresion_ms: clientMetrics.compressionMs,
      envio_ms: clientMetrics.sendMs,
      total_ms: clientMetrics.totalMs,
      etapas: result?.etapas ?? [],
      peso_bruto_kg: result?.peso_bruto_kg,
      peso_eje_kg: result?.peso_eje_kg,
      peso_neto_kg: result?.peso_neto_kg,
      confianza: result?.confianza,
      maquina: result?.maquina_codigo ?? maquinaCodigo,
      numero_rollo: result?.numero_rollo ?? numeroRollo,
      storage_writes: result?.storage_writes,
      db_writes: result?.db_writes,
      dryRun: result?.dryRun,
      error_code: errorCode || null,
      error_message: errorMsg || null,
    };
    await navigator.clipboard.writeText(JSON.stringify(rep, null, 2));
    toast.success("Reporte técnico copiado (sanitizado).");
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Diagnóstico de Pesaje V2</h1>
        <Badge variant="secondary" className="text-xs">Ruta temporal · no productiva</Badge>
      </div>

      <Alert>
        <AlertTitle>Modo de prueba</AlertTitle>
        <AlertDescription>
          No almacena fotografías ni crea registros. <b>dryRun=true</b> obligatorio.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Sesión</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <div><span className="text-muted-foreground">Usuario:</span> {nombre} — {userEmail}</div>
          <div><span className="text-muted-foreground">Roles:</span> {rolesTxt}</div>
          <div><span className="text-muted-foreground">Online:</span> {typeof navigator !== "undefined" && navigator.onLine ? "sí" : "no"}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Contexto de la prueba</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Máquina</Label>
            <select
              className="w-full h-10 border rounded-md px-2 bg-background"
              value={maquinaCodigo}
              onChange={(e) => setMaquinaCodigo(e.target.value)}
              disabled={running}
            >
              <option value="">Selecciona…</option>
              {MAQUINAS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <Label>Número de rollo</Label>
            <Input value={numeroRollo} onChange={(e) => setNumeroRollo(e.target.value)} disabled={running} placeholder="Ej. 9999-4" />
          </div>
          <div>
            <Label>Orden de producción (opcional)</Label>
            <Input value={numeroOrden} onChange={(e) => setNumeroOrden(e.target.value)} disabled={running} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Fotografía</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            disabled={running}
          />
          <Button
            type="button"
            variant="outline"
            className="w-full h-16 text-base"
            onClick={() => fileInputRef.current?.click()}
            disabled={running}
          >
            <Camera className="h-6 w-6 mr-2" />
            {file ? "Cambiar fotografía" : "Tomar fotografía"}
          </Button>
          {previewUrl && (
            <div className="space-y-2">
              <img src={previewUrl} alt="Preview" className="max-h-64 rounded-md border object-contain w-full bg-muted" />
              <div className="text-xs text-muted-foreground">
                Original: {origSize.toLocaleString()} B · {origW}×{origH}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={ejecutar} disabled={running || !file} className="min-w-48">
          {running ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{stage} · {(elapsedMs/1000).toFixed(1)}s</> : "Ejecutar prueba OCR"}
        </Button>
        <Button variant="outline" onClick={limpiar} disabled={running}>
          <RefreshCw className="h-4 w-4 mr-2" />Limpiar prueba
        </Button>
        {(result || errorCode) && (
          <Button variant="outline" onClick={copiarReporte} disabled={running}>
            <Copy className="h-4 w-4 mr-2" />Copiar reporte técnico
          </Button>
        )}
      </div>

      {classification && (
        <Alert variant={classification === "APROBADA" ? "default" : "destructive"}>
          <AlertTitle>
            {classification === "APROBADA" && "✅ PRUEBA APROBADA"}
            {classification === "RECHAZADA" && "⛔ PRUEBA RECHAZADA"}
            {classification === "INCONCLUSA" && "⚠️ PRUEBA INCONCLUSA"}
          </AlertTitle>
          <AlertDescription className="text-xs">
            {errorCode && <div><b>{errorCode}</b>: {errorMsg}</div>}
            {!errorCode && classification === "APROBADA" && "Sin escrituras en Storage ni base de datos. OCR con confianza suficiente."}
            {!errorCode && classification === "INCONCLUSA" && "La imagen llegó y se procesó, pero no se obtuvo un peso legible con confianza suficiente."}
          </AlertDescription>
        </Alert>
      )}

      {(result || errorCode) && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Panel de resultados</CardTitle></CardHeader>
          <CardContent className="text-xs font-mono grid grid-cols-1 md:grid-cols-2 gap-2">
            <Row k="requestId (cliente)" v={requestId} />
            <Row k="requestId (función)" v={result?.requestId ?? "—"} />
            <Row k="HTTP" v={clientMetrics.httpStatus ?? "—"} />
            <Row k="Inicio" v={clientMetrics.startedAt ?? "—"} />
            <Row k="Fin" v={clientMetrics.endedAt ?? "—"} />
            <Row k="Compresión (ms)" v={clientMetrics.compressionMs ?? "—"} />
            <Row k="Envío (ms)" v={clientMetrics.sendMs ?? "—"} />
            <Row k="Total (ms)" v={clientMetrics.totalMs ?? "—"} />
            <Row k="Tamaño comprimido" v={clientMetrics.compressedBytes ? `${clientMetrics.compressedBytes.toLocaleString()} B` : "—"} />
            <Row k="Dim. comprimida" v={clientMetrics.compressedW ? `${clientMetrics.compressedW}×${clientMetrics.compressedH}` : "—"} />
            <Row k="Peso bruto (kg)" v={result?.peso_bruto_kg ?? "—"} />
            <Row k="Tara (kg)" v={result?.peso_eje_kg ?? "—"} />
            <Row k="Peso neto (kg)" v={result?.peso_neto_kg ?? "—"} />
            <Row k="Confianza" v={result?.confianza != null ? `${result.confianza}%` : "—"} />
            <Row k="storage_writes" v={result?.storage_writes ?? "—"} />
            <Row k="db_writes" v={result?.db_writes ?? "—"} />
            <Row k="dryRun" v={String(result?.dryRun ?? "—")} />
            <div className="md:col-span-2">
              <div className="text-muted-foreground mb-1">Etapas función:</div>
              <pre className="bg-muted p-2 rounded overflow-auto text-[10px] max-h-64">
{JSON.stringify(result?.etapas ?? [], null, 2)}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 border-b py-1">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right break-all">{String(v)}</span>
    </div>
  );
}

class DiagError extends Error {
  code: string; payload?: unknown;
  constructor(code: string, message: string, payload?: unknown) {
    super(message); this.code = code; this.payload = payload;
  }
}

function clasificar(body: any, ridEnviado: string, http: number): Clasificacion {
  if (!body || typeof body !== "object") return "RECHAZADA";
  if (http < 200 || http >= 300) return "RECHAZADA";
  if (body.requestId !== ridEnviado) return "RECHAZADA";
  if (body.dryRun !== true) return "RECHAZADA";
  if (body.storage_writes !== 0) return "RECHAZADA";
  if (body.db_writes !== 0) return "RECHAZADA";
  const etapas: Etapa[] = body.etapas ?? [];
  const hasSession = etapas.some((e) => e.etapa === "session_validation");
  const hasOcr = etapas.some((e) => e.etapa === "ocr_completed");
  if (!hasSession || !hasOcr) return "RECHAZADA";
  if (body.aceptado === true && (body.confianza ?? 0) >= 85 && body.peso_neto_kg != null) return "APROBADA";
  if (body.aceptado === false) return "INCONCLUSA";
  return "RECHAZADA";
}
