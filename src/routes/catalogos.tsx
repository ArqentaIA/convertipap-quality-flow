import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { QUALITY_VARIABLES, PLANTS } from "@/lib/qc-data";
import { Plus, Pencil } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/catalogos")({ component: CatalogosPage });

const MAQUINAS = [
  { codigo: "MP-05", planta: "Tlaxcala", tipo: "Yankee", ancho: "2.85 m", veloc: "1800 m/min" },
  { codigo: "MP-06", planta: "Tlaxcala", tipo: "Yankee", ancho: "2.85 m", veloc: "1800 m/min" },
  { codigo: "MP-07", planta: "Planta 2", tipo: "TAD", ancho: "2.70 m", veloc: "1500 m/min" },
  { codigo: "MP-08", planta: "Planta 2", tipo: "Yankee", ancho: "2.80 m", veloc: "1500 m/min" },
  { codigo: "MP-09", planta: "Planta 3", tipo: "Crescent", ancho: "2.65 m", veloc: "1650 m/min" },
  { codigo: "MP-10", planta: "Planta 3", tipo: "Yankee", ancho: "2.75 m", veloc: "1700 m/min" },
];

const PRODUCTOS = [
  { sku: "PH-201", nombre: "PST Higiénico 13 g/m²", familia: "Higiénico", uso: "Doméstico" },
  { sku: "PH-202", nombre: "PST Higiénico 12.5 g/m²", familia: "Higiénico", uso: "Institucional" },
  { sku: "PT-310", nombre: "PST Toalla 22 g/m²", familia: "Toalla", uso: "Institucional" },
  { sku: "PS-415", nombre: "PST Servilleta 17 g/m²", familia: "Servilleta", uso: "HoReCa" },
  { sku: "PF-520", nombre: "PST Facial 15 g/m²", familia: "Facial", uso: "Doméstico" },
];

type Tab = "plantas" | "maquinas" | "productos" | "variables";

function CatalogosPage() {
  const [tab, setTab] = useState<Tab>("plantas");
  return (
    <AppLayout title="Catálogos">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1 shadow-sm">
            {([
              ["plantas", "Plantas"], ["maquinas", "Máquinas"],
              ["productos", "Productos"], ["variables", "Variables de calidad"],
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
          <button className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
            <Plus className="h-4 w-4" /> Nuevo
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {tab === "plantas" && (
            <Table headers={["Código", "Nombre", "Estatus"]} rows={PLANTS.map(p => [p.code, p.name, "Activa"])} />
          )}
          {tab === "maquinas" && (
            <Table
              headers={["Código", "Planta", "Tipo", "Ancho útil", "Velocidad nom."]}
              rows={MAQUINAS.map(m => [m.codigo, m.planta, m.tipo, m.ancho, m.veloc])}
            />
          )}
          {tab === "productos" && (
            <Table
              headers={["SKU", "Producto", "Familia", "Uso"]}
              rows={PRODUCTOS.map(p => [p.sku, p.nombre, p.familia, p.uso])}
            />
          )}
          {tab === "variables" && (
            <Table
              headers={["Variable", "Unidad", "Mín.", "Objetivo", "Máx."]}
              rows={QUALITY_VARIABLES.map(v => [v.label, v.unit || "—", v.min, v.objective, v.max])}
            />
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
        <tr>
          {headers.map((h) => <th key={h} className="px-4 py-3">{h}</th>)}
          <th className="px-4 py-3 w-12"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-border hover:bg-muted/30">
            {r.map((c, j) => (
              <td key={j} className={`px-4 py-3 ${j === 0 ? "font-medium text-foreground" : "text-foreground/90"} tabular-nums`}>{c}</td>
            ))}
            <td className="px-4 py-3 text-right">
              <button className="text-muted-foreground hover:text-primary"><Pencil className="h-4 w-4" /></button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
