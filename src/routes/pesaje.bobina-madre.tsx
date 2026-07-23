import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Camera, Scale, CheckCircle2, XCircle, Loader2, RefreshCw, Upload, Info, ImageIcon,
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
      { name: "description", content: "Captura de pesaje de bobina madre con OCR y evidencia" },
      { property: "og:title", content: "Pesaje de Bobina Madre · Convertipap" },
      { property: "og:description", content: "Captura de pesaje de bobina madre con OCR y evidencia" },
    ],
  }),
  component: () => (
    <AppLayout title="Control de Pesaje · Bobina Madre">
      <PesajeBobinaPage />
    </AppLayout>
  ),
});

type Maquina = { id: string; codigo: string };
const PESO_EJE = 300;

type OcrResult =
  | { aceptado: true; peso_kg: number; confianza: number; unidad: string; ocr: unknown }
  | { aceptado: false; motivo_rechazo: string; confianza?: number; ocr?: unknown };

function PesajeBobinaPage() {
  const qc = useQueryClient();

  // Estado del wizard
  const [maquinaId, setMaquinaId] = useState<string>("");
  const [numeroRollo, setNumeroRollo] = useState("");
  const [numeroOrden, setNumeroOrden] = useState("");
  const [evidenciaFile, setEvidenciaFile] = useState<File | null>(null);
  const [evidenciaPreview, setEvidenciaPreview] = useState<string | null>(null);
  const [uploadingPath, setUploadingPath] = useState<string | null>(null);
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const listar = useServerFn(listPesajes);
  const listaQ = useQuery({
    queryKey: ["pesajes", "lista"],
    queryFn: () => listar(),
    staleTime: 30_000,
  });

  const crear = useServerFn(crearPesaje);

  function resetForm() {
    setNumeroRollo("");
    setNumeroOrden("");
    setEvidenciaFile(null);
    setEvidenciaPreview(null);
    setUploadingPath(null);
    setOcr(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
      toast.error("Solo se aceptan imágenes JPG, PNG o WEBP.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error("La imagen supera 10 MB.");
      return;
    }
    setEvidenciaFile(f);
    setOcr(null);
    setUploadingPath(null);
    const url = URL.createObjectURL(f);
    setEvidenciaPreview(url);
  }

  async function analizar() {
    if (!maquinaId) return toast.error("Selecciona máquina primero.");
    if (!numeroRollo.trim()) return toast.error("Captura el número de rollo.");
    if (!evidenciaFile) return toast.error("Adjunta la foto del display.");
    setAnalizando(true);
    setOcr(null);
    try {
      // Subir al bucket privado
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? "anon";
      const ext = evidenciaFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${uid}/${Date.now()}-${numeroRollo.trim()}.${ext}`;
      const up = await supabase.storage
        .from("pesajes-evidencia")
        .upload(path, evidenciaFile, { upsert: false, contentType: evidenciaFile.type });
      if (up.error) throw new Error(`Subida: ${up.error.message}`);
      setUploadingPath(path);

      // Llamar Edge Function (OCR server-side con Gemini)
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const resp = await supabase.functions.invoke("analizar-peso-bobina", {
        body: { evidencia_path: path },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (resp.error) throw new Error(resp.error.message);
      const r = resp.data as OcrResult;
      setOcr(r);
      if (r.aceptado) {
        toast.success(`Peso detectado: ${r.peso_kg} kg (confianza ${r.confianza}%)`);
      } else {
        toast.error(`Lectura rechazada: ${r.motivo_rechazo}`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAnalizando(false);
    }
  }

  async function guardar() {
    if (!ocr || !ocr.aceptado || !uploadingPath) return;
    setGuardando(true);
    try {
      await crear({
        data: {
          numero_rollo: numeroRollo.trim(),
          maquina_id: maquinaId,
          numero_orden: numeroOrden.trim() || null,
          peso_bruto_kg: ocr.peso_kg,
          evidencia_path: uploadingPath,
          ocr_confianza: ocr.confianza,
          ocr_raw: ocr.ocr as never,
        },
      });
      toast.success("Pesaje registrado.");
      resetForm();
      qc.invalidateQueries({ queryKey: ["pesajes"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  const pesoNeto = ocr?.aceptado ? Number((ocr.peso_kg - PESO_EJE).toFixed(2)) : null;
  const puedeGuardar = !!ocr && ocr.aceptado && !!uploadingPath && !guardando;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      {/* Wizard */}
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <header className="mb-4 flex items-center gap-2">
          <Scale className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Nuevo pesaje de bobina madre</h2>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Máquina *</label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={maquinaId}
              onChange={(e) => setMaquinaId(e.target.value)}
              disabled={maquinasQ.isLoading}
            >
              <option value="">Selecciona…</option>
              {maquinasQ.data?.map((m) => (
                <option key={m.id} value={m.id}>{m.codigo}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">N.º de rollo *</label>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={numeroRollo}
              onChange={(e) => setNumeroRollo(e.target.value.toUpperCase())}
              placeholder="Ej. 2807-6"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Orden de producción (opcional)</label>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={numeroOrden}
              onChange={(e) => setNumeroOrden(e.target.value.trim())}
              placeholder="Número SAP"
            />
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {/* Evidencia */}
          <div className="rounded-md border border-dashed border-border p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Camera className="h-4 w-4" /> Fotografía del display
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={onPickFile}
              className="block w-full text-sm"
            />
            {evidenciaPreview && (
              <div className="mt-3 overflow-hidden rounded-md border border-border bg-muted">
                <img src={evidenciaPreview} alt="Evidencia" className="max-h-72 w-full object-contain" />
              </div>
            )}
            <div className="mt-2 text-[11px] text-muted-foreground">
              JPG / PNG / WEBP · máx. 10 MB · toma la foto con el display completo, enfocado y sin reflejos.
            </div>
          </div>

          {/* OCR result */}
          <div className="rounded-md border border-border bg-background p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Info className="h-4 w-4" /> Lectura OCR (Gemini · server-side)
            </div>
            {!ocr && (
              <p className="text-sm text-muted-foreground">
                Adjunta la fotografía y pulsa <b>Analizar</b>. El sistema aceptará la lectura
                solo si la confianza es ≥ 85% y se cumplen las 7 reglas de validación.
              </p>
            )}
            {ocr && ocr.aceptado && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">Lectura aceptada · confianza {ocr.confianza}%</span>
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-md bg-muted/50 p-3 text-center text-sm">
                  <div><div className="text-[11px] text-muted-foreground">Bruto</div><div className="font-semibold">{ocr.peso_kg} kg</div></div>
                  <div><div className="text-[11px] text-muted-foreground">Eje</div><div className="font-semibold">{PESO_EJE} kg</div></div>
                  <div className="rounded bg-amber-100 text-amber-900"><div className="text-[11px]">Neto</div><div className="font-bold">{pesoNeto} kg</div></div>
                </div>
              </div>
            )}
            {ocr && !ocr.aceptado && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-destructive">
                  <XCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Lectura rechazada</span>
                </div>
                <p className="text-xs text-destructive/90">{ocr.motivo_rechazo}</p>
                <p className="text-xs text-muted-foreground">Toma nuevamente la fotografía y vuelve a analizar.</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={analizar}
            disabled={analizando || !evidenciaFile}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {analizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {analizando ? "Analizando…" : "Analizar fotografía"}
          </button>
          <button
            onClick={guardar}
            disabled={!puedeGuardar}
            className="inline-flex items-center gap-2 rounded-md bg-success px-4 py-2 text-sm font-medium text-success-foreground disabled:opacity-50"
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Guardar pesaje
          </button>
          <button
            onClick={resetForm}
            className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm"
          >
            <RefreshCw className="h-4 w-4" /> Limpiar
          </button>
        </div>
      </section>

      {/* Historial */}
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
              <th className="px-3 py-2 text-right">Confianza</th>
              <th className="px-3 py-2">Evidencia</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Cargando…</td></tr>
            )}
            {!loading && lista.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Sin registros aún.</td></tr>
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
                <td className="px-3 py-2 text-right">{p.ocr_confianza != null ? `${Number(p.ocr_confianza).toFixed(0)}%` : "—"}</td>
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
