import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Camera, CheckCircle2, XCircle, Loader2, RefreshCw, Upload, ImageIcon,
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
const TARA_POR_MAQUINA: Record<string, number> = {
  "MP-04": 560,
  "MP-05": 750,
  "MP-06": 1160,
  "MP-07": 1260,
};
function taraPorMaquina(codigo: string): number {
  return TARA_POR_MAQUINA[codigo] ?? 300;
}

type OcrResult =
  | { aceptado: true; registro: PesajeBobina }
  | { aceptado: false; motivo_rechazo: string; confianza?: number };

function PesajeBobinaPage() {
  const qc = useQueryClient();

  // Estado del wizard
  const [maquinaId, setMaquinaId] = useState<string>("");
  const [numeroRollo, setNumeroRollo] = useState("");
  const [numeroOrden, setNumeroOrden] = useState("");
  const [ordenSel, setOrdenSel] = useState<string>(""); // "" | id de orden | "__otro__"
  const [ordenOtro, setOrdenOtro] = useState("");
  const [evidenciaFile, setEvidenciaFile] = useState<File | null>(null);
  const [evidenciaPreview, setEvidenciaPreview] = useState<string | null>(null);
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [procesando, setProcesando] = useState(false);
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

  const maqCodigo = useMemo(
    () => maquinasQ.data?.find((m) => m.id === maquinaId)?.codigo ?? "",
    [maquinasQ.data, maquinaId],
  );
  // Sufijo automático según máquina: MP-04→"4", MP-05→"5", etc.
  const sufijoMaq = useMemo(() => {
    const m = /(\d)$/.exec(maqCodigo);
    return m ? m[1] : "";
  }, [maqCodigo]);
  const baseRollo = useMemo(() => {
    if (!numeroRollo) return "";
    const m = /^(.*)-(\d)$/.exec(numeroRollo);
    return m ? m[1] : numeroRollo;
  }, [numeroRollo]);
  // Auto-corrige el sufijo cuando cambia la máquina.
  useEffect(() => {
    if (!sufijoMaq) return;
    setNumeroRollo((prev) => {
      if (!prev) return prev;
      const m = /^(.*)-(\d)$/.exec(prev);
      if (m) {
        if (m[2] !== sufijoMaq) {
          toast.info(`Sufijo de rollo corregido a -${sufijoMaq} para ${maqCodigo}`);
          return `${m[1]}-${sufijoMaq}`;
        }
        return prev;
      }
      return `${prev}-${sufijoMaq}`;
    });
  }, [sufijoMaq, maqCodigo]);


  // Órdenes de producción activas
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

  function resetForm() {
    setNumeroRollo("");
    setNumeroOrden("");
    setOrdenSel("");
    setOrdenOtro("");
    setEvidenciaFile(null);
    setEvidenciaPreview(null);
    setOcr(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
      toast.error("Solo se aceptan imágenes JPG, PNG o WEBP.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error("La imagen supera 10 MB.");
      return;
    }
    // Bloqueo: solo se acepta evidencia capturada al momento con la cámara.
    // Archivos guardados en la galería tendrán lastModified antiguo.
    const ageMs = Date.now() - (f.lastModified || 0);
    if (!f.lastModified || ageMs > 60_000) {
      toast.error(
        "Solo se permite tomar la fotografía al momento. No se aceptan archivos guardados.",
      );
      return;
    }
    setEvidenciaFile(f);
    setOcr(null);
    const url = URL.createObjectURL(f);
    setEvidenciaPreview(url);
  }

  async function analizarYRegistrar() {
    if (!maquinaId) return toast.error("Selecciona máquina primero.");
    if (!numeroRollo.trim()) return toast.error("Captura el número de rollo.");
    if (!evidenciaFile) return toast.error("Adjunta la foto del display.");
    setProcesando(true);
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

      // La Edge Function ejecuta OCR + valida + inserta el registro definitivo.
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const resp = await supabase.functions.invoke("analizar-peso-bobina", {
        body: {
          evidencia_path: path,
          maquina_id: maquinaId,
          numero_rollo: numeroRollo.trim(),
          numero_orden: numeroOrden.trim() || null,
        },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (resp.error) throw new Error(resp.error.message);
      const r = resp.data as OcrResult;
      setOcr(r);
      if (r.aceptado) {
        toast.success(`Pesaje registrado: ${r.registro.peso_neto_kg} kg netos.`);
        qc.invalidateQueries({ queryKey: ["pesajes"] });
        setTimeout(resetForm, 800);
      } else {
        toast.error(`Lectura rechazada: ${r.motivo_rechazo}. Toma una nueva fotografía.`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setProcesando(false);
    }
  }


  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      {/* Wizard */}
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <header className="mb-4 flex items-center">
          <h2 className="text-lg font-semibold">Nuevo pesaje de bobina madre</h2>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Orden de producción (opcional)</label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={ordenSel}
              onChange={(e) => {
                const v = e.target.value;
                setOrdenSel(v);
                if (v === "__otro__") {
                  setNumeroOrden(ordenOtro.trim());
                } else if (v === "") {
                  setNumeroOrden("");
                } else {
                  const o = ordenesQ.data?.find((x) => x.id === v);
                  setNumeroOrden(o?.numero_orden ?? "");
                }
              }}
              disabled={ordenesQ.isLoading}
            >
              <option value="">Selecciona…</option>
              {ordenesQ.data?.map((o) => (
                <option key={o.id} value={o.id}>{o.numero_orden}</option>
              ))}
              <option value="__otro__">Otro (capturar manualmente)</option>
            </select>
            {ordenSel === "__otro__" && (
              <input
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              N.º de rollo * <span className="text-[10px] font-normal text-muted-foreground">(sufijo automático según máquina)</span>
            </label>
            <div className="flex items-stretch gap-2">
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={baseRollo}
                onChange={(e) => {
                  const raw = e.target.value.toUpperCase().replace(/-\d$/, "").trim();
                  setNumeroRollo(raw ? (sufijoMaq ? `${raw}-${sufijoMaq}` : raw) : "");
                }}
                placeholder={maqCodigo ? `Ej. 2807-${sufijoMaq || "X"}` : "Selecciona máquina primero"}
                disabled={!maquinaId}
              />
              <span
                className="inline-flex min-w-[52px] items-center justify-center rounded-md border border-input bg-muted px-3 text-sm font-semibold text-foreground"
                aria-label={`Sufijo fijo -${sufijoMaq || "?"}`}
              >
                -{maquinaId ? (sufijoMaq || "?") : "?"}
              </span>
            </div>
          </div>


        <div className="mt-5">
          {/* Evidencia — zona premium táctil */}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={onPickFile}
            className="hidden"
          />

          {!evidenciaPreview ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="group relative flex min-h-[280px] w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border-2 border-dashed border-primary/40 bg-gradient-to-br from-primary/5 via-background to-primary/10 p-8 text-center transition-all hover:border-primary hover:from-primary/10 hover:to-primary/20 active:scale-[0.99]"
            >
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/15 ring-8 ring-primary/5 transition-transform group-hover:scale-110 group-active:scale-95">
                <Camera className="h-12 w-12 text-primary" strokeWidth={1.75} />
              </div>
              <div className="space-y-1">
                <div className="text-lg font-semibold text-foreground">Tocar para tomar la fotografía</div>
                <div className="text-sm text-muted-foreground">Se abrirá la cámara de la tablet</div>
              </div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
                Solo captura en vivo · no se aceptan archivos guardados
              </div>
            </button>
          ) : (
            <div className="relative overflow-hidden rounded-2xl border border-border bg-black/90 shadow-lg">
              <img src={evidenciaPreview} alt="Evidencia" className="max-h-[320px] w-full object-contain" />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-xs font-medium text-foreground shadow-md backdrop-blur hover:bg-white"
              >
                <Camera className="h-4 w-4" /> Reemplazar
              </button>
              <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-success/90 px-3 py-1 text-[11px] font-medium text-white">
                <CheckCircle2 className="h-3.5 w-3.5" /> Evidencia lista
              </div>
            </div>
          )}

          {/* Resultado OCR — solo cuando existe */}
          {ocr && ocr.aceptado && (
            <div className="mt-4 rounded-2xl border border-border bg-background p-5">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm font-medium">
                  Registrado · confianza {ocr.registro.ocr_confianza ?? "—"}%
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 rounded-md bg-muted/50 p-3 text-center text-sm">
                <div><div className="text-[11px] text-muted-foreground">Bruto</div><div className="font-semibold">{Number(ocr.registro.peso_bruto_kg)} kg</div></div>
                <div><div className="text-[11px] text-muted-foreground">Eje ({ocr.registro.maquina_codigo})</div><div className="font-semibold">{taraPorMaquina(ocr.registro.maquina_codigo)} kg</div></div>
                <div className="rounded bg-amber-100 text-amber-900"><div className="text-[11px]">Neto</div><div className="font-bold">{Number(ocr.registro.peso_neto_kg)} kg</div></div>
              </div>
            </div>
          )}
          {ocr && !ocr.aceptado && (
            <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
              <div className="flex items-center gap-2 text-destructive">
                <XCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Lectura rechazada · no se registró</span>
              </div>
              <p className="mt-1 text-xs text-destructive/90">{ocr.motivo_rechazo}</p>
              <p className="text-xs text-muted-foreground">Toma nuevamente la fotografía y vuelve a analizar.</p>
            </div>
          )}
        </div>



        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={analizarYRegistrar}
            disabled={procesando || !evidenciaFile}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {procesando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {procesando ? "Analizando y registrando…" : "Analizar y registrar"}
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
