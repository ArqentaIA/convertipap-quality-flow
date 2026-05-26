import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { Search, Plus, Shield } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/usuarios")({ component: UsuariosPage });

type Usuario = {
  nombre: string;
  email: string;
  rol: "Administrador" | "Analista" | "Jefe de máquina" | "Operador" | "Supervisor";
  planta: string;
  activo: boolean;
  ultimo: string;
};

const USUARIOS: Usuario[] = [
  { nombre: "Christian Hernández", email: "christian.h@convertipap.mx", rol: "Analista", planta: "Tlaxcala", activo: true, ultimo: "hace 5 min" },
  { nombre: "Erick Ordoñez", email: "erick.o@convertipap.mx", rol: "Jefe de máquina", planta: "Tlaxcala", activo: true, ultimo: "hace 22 min" },
  { nombre: "Palemón Gutiérrez", email: "palemon.g@convertipap.mx", rol: "Operador", planta: "Tlaxcala", activo: true, ultimo: "hace 1 h" },
  { nombre: "Ricardo Mendoza", email: "ricardo.m@convertipap.mx", rol: "Operador", planta: "Tlaxcala", activo: true, ultimo: "hace 3 h" },
  { nombre: "Adrián Pérez", email: "adrian.p@convertipap.mx", rol: "Jefe de máquina", planta: "Tlaxcala", activo: true, ultimo: "ayer" },
  { nombre: "Roberto Mejía", email: "roberto.m@convertipap.mx", rol: "Supervisor", planta: "Tlaxcala", activo: true, ultimo: "hace 2 h" },
  { nombre: "Laura Vázquez", email: "laura.v@convertipap.mx", rol: "Administrador", planta: "Tlaxcala", activo: true, ultimo: "hace 12 min" },
  { nombre: "Daniel Rojas", email: "daniel.r@convertipap.mx", rol: "Operador", planta: "Tlaxcala", activo: false, ultimo: "hace 8 días" },
];

const ROL_COLORS: Record<Usuario["rol"], string> = {
  Administrador: "bg-primary/15 text-primary border-primary/30",
  Analista: "bg-success/15 text-success border-success/30",
  "Jefe de máquina": "bg-warning/25 text-foreground border-warning/40",
  Supervisor: "bg-accent text-accent-foreground border-border",
  Operador: "bg-muted text-foreground/80 border-border",
};

function UsuariosPage() {
  const [q, setQ] = useState("");
  const filtered = USUARIOS.filter(u => [u.nombre, u.email, u.rol, u.planta].join(" ").toLowerCase().includes(q.toLowerCase()));
  return (
    <AppLayout title="Usuarios y permisos">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Usuarios totales" value={String(USUARIOS.length)} />
          <Stat label="Activos" value={String(USUARIOS.filter(u => u.activo).length)} tone="success" />
          <Stat label="Roles definidos" value="5" />
          <Stat label="Plantas con acceso" value="1" tone="primary" />
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nombre, correo, rol o planta…"
                className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4" /> Nuevo usuario
            </button>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Planta</th>
                <th className="px-4 py-3">Último acceso</th>
                <th className="px-4 py-3">Estatus</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.email} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                        {u.nombre.split(" ").map(n => n[0]).slice(0, 2).join("")}
                      </div>
                      <div>
                        <div className="font-medium text-foreground">{u.nombre}</div>
                        <div className="text-[11px] text-muted-foreground">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ROL_COLORS[u.rol]}`}>
                      <Shield className="h-3 w-3" /> {u.rol}
                    </span>
                  </td>
                  <td className="px-4 py-3">{u.planta}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.ultimo}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${u.activo ? "text-success" : "text-muted-foreground"}`}>
                      <span className={`h-2 w-2 rounded-full ${u.activo ? "bg-success" : "bg-muted-foreground/50"}`} />
                      {u.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-xs text-primary hover:underline">Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "primary" | "success" }) {
  const tones: Record<string, string> = { default: "text-foreground", primary: "text-primary", success: "text-success" };
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${tones[tone]}`}>{value}</div>
    </div>
  );
}
