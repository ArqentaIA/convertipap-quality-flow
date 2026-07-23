import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { Search, Shield, Lock, Mail, User2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole, type AppModule } from "@/lib/auth";

export const Route = createFileRoute("/usuarios")({ component: UsuariosPage });

type UsuarioFila = {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
  roles: AppRole[];
  modulos: AppModule[];
};

const ROL_LABEL: Record<AppRole, string> = {
  administrador: "Administrador",
  gerente_general: "Gerente General",
  direccion: "Dirección",
  calidad: "Calidad",
  calidad_operativo: "Calidad Operativo",
  capturista: "Capturista",
  reportes_consulta: "Reportes / Consulta",
  planeacion: "Planeación",
};

const ROL_COLORS: Record<AppRole, string> = {
  administrador: "bg-primary/15 text-primary border-primary/30",
  gerente_general: "bg-primary/10 text-primary border-primary/25",
  direccion: "bg-accent text-accent-foreground border-border",
  calidad: "bg-success/15 text-success border-success/30",
  calidad_operativo: "bg-success/10 text-success border-success/25",
  capturista: "bg-muted text-foreground/80 border-border",
  reportes_consulta: "bg-accent text-accent-foreground border-border",
  planeacion: "bg-primary/10 text-primary border-primary/25",
};

const MODULO_LABEL: Record<AppModule, string> = {
  dashboard: "Dashboard",
  produccion: "Producción",
  control_calidad: "Control de Calidad",
  variables_calidad: "Variables de Calidad",
  reportes: "Reportes",
  configuracion: "Configuración",
  usuarios_permisos: "Usuarios y permisos",
  auditoria: "Auditoría",
  ordenes_produccion: "Órdenes de Producción",
  pesaje_bobina_madre: "Pesaje de Bobina Madre",

};

function UsuariosPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [usuarios, setUsuarios] = useState<UsuarioFila[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Defensa adicional: si el usuario llega por URL directa sin permiso,
  // redirigir al primer módulo permitido (o /login si no tiene ninguno).
  const tienePermiso =
    auth.hasRole("administrador") || auth.hasRole("gerente_general");

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.isAuthenticated) {
      void navigate({ to: "/login", replace: true });
      return;
    }
    if (!tienePermiso) {
      const ORDEN: Array<{ mod: AppModule; to: string }> = [
        { mod: "dashboard", to: "/" },
        { mod: "produccion", to: "/produccion" },
        { mod: "control_calidad", to: "/calidad/captura" },
        { mod: "variables_calidad", to: "/variables-calidad" },
        { mod: "reportes", to: "/reportes" },
        { mod: "configuracion", to: "/configuracion" },
      ];
      const destino = ORDEN.find((o) => auth.canAccess(o.mod))?.to ?? "/login";
      void navigate({ to: destino, replace: true });
    }
  }, [auth.loading, auth.isAuthenticated, tienePermiso, navigate, auth]);

  useEffect(() => {
    if (!tienePermiso) return;
    let cancelado = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [perfilesRes, rolesRes, modsRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("id, email, nombre, activo")
            .order("nombre", { ascending: true }),
          supabase.from("user_roles").select("user_id, role"),
          supabase.from("module_permissions").select("role, module"),
        ]);

        if (perfilesRes.error) throw perfilesRes.error;
        if (rolesRes.error) throw rolesRes.error;
        if (modsRes.error) throw modsRes.error;

        const rolesPorUsuario = new Map<string, AppRole[]>();
        for (const r of rolesRes.data ?? []) {
          const arr = rolesPorUsuario.get(r.user_id) ?? [];
          arr.push(r.role as AppRole);
          rolesPorUsuario.set(r.user_id, arr);
        }

        const modulosPorRol = new Map<AppRole, AppModule[]>();
        for (const m of modsRes.data ?? []) {
          const arr = modulosPorRol.get(m.role as AppRole) ?? [];
          arr.push(m.module as AppModule);
          modulosPorRol.set(m.role as AppRole, arr);
        }

        const filas: UsuarioFila[] = (perfilesRes.data ?? []).map((p) => {
          const userRoles = rolesPorUsuario.get(p.id) ?? [];
          const modSet = new Set<AppModule>();
          for (const rol of userRoles) {
            for (const m of modulosPorRol.get(rol) ?? []) modSet.add(m);
          }
          return {
            id: p.id,
            nombre: p.nombre,
            email: p.email,
            activo: p.activo,
            roles: userRoles,
            modulos: Array.from(modSet),
          };
        });

        if (!cancelado) setUsuarios(filas);
      } catch (e) {
        if (!cancelado)
          setError(e instanceof Error ? e.message : "Error desconocido");
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [tienePermiso]);

  const filtered = useMemo(
    () =>
      usuarios.filter((u) =>
        [u.nombre, u.email, ...u.roles.map((r) => ROL_LABEL[r])]
          .join(" ")
          .toLowerCase()
          .includes(q.toLowerCase()),
      ),
    [usuarios, q],
  );

  // Mientras se valida permiso, no renderizar contenido
  if (auth.loading || !tienePermiso) {
    return (
      <AppLayout title="Usuarios y permisos">
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
          Verificando permisos…
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Usuarios y permisos">
      <div className="space-y-6">
        {/* Aviso de solo lectura */}
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-muted-foreground">
            Este módulo es <span className="font-semibold text-foreground">informativo</span>.
            La gestión real de usuarios (alta, baja, cambio de rol, restablecimiento
            de contraseña) se realiza directamente desde el panel de administración
            del sistema.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Usuarios totales" value={String(usuarios.length)} />
          <Stat
            label="Activos"
            value={String(usuarios.filter((u) => u.activo).length)}
            tone="success"
          />
          <Stat label="Roles definidos" value="5" />
          <Stat label="Módulos del sistema" value="7" tone="primary" />
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nombre, correo o rol…"
                className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Cargando usuarios…
            </div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-destructive">
              Error: {error}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Usuario</th>
                    <th className="px-4 py-3">Correo</th>
                    <th className="px-4 py-3">Rol asignado</th>
                    <th className="px-4 py-3">Módulos a los que tiene acceso</th>
                    <th className="px-4 py-3">Estatus</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-muted-foreground"
                      >
                        Sin resultados.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((u) => (
                      <tr
                        key={u.id}
                        className="border-t border-border hover:bg-muted/30"
                      >
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {u.nombre
                                .split(" ")
                                .map((n) => n[0])
                                .slice(0, 2)
                                .join("")
                                .toUpperCase() || (
                                <User2 className="h-4 w-4" />
                              )}
                            </div>
                            <div className="font-medium text-foreground">
                              {u.nombre}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5" />
                            {u.email}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-wrap gap-1">
                            {u.roles.length === 0 ? (
                              <span className="text-xs italic text-muted-foreground">
                                sin rol
                              </span>
                            ) : (
                              u.roles.map((r) => (
                                <span
                                  key={r}
                                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ROL_COLORS[r]}`}
                                >
                                  <Shield className="h-3 w-3" />
                                  {ROL_LABEL[r]}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-wrap gap-1">
                            {u.modulos.length === 0 ? (
                              <span className="text-xs italic text-muted-foreground">
                                ninguno
                              </span>
                            ) : (
                              u.modulos.map((m) => (
                                <span
                                  key={m}
                                  className="inline-flex items-center rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground/80"
                                >
                                  {MODULO_LABEL[m]}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-medium ${u.activo ? "text-success" : "text-muted-foreground"}`}
                          >
                            <span
                              className={`h-2 w-2 rounded-full ${u.activo ? "bg-success" : "bg-muted-foreground/50"}`}
                            />
                            {u.activo ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "primary" | "success";
}) {
  const tones: Record<string, string> = {
    default: "text-foreground",
    primary: "text-primary",
    success: "text-success",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${tones[tone]}`}>
        {value}
      </div>
    </div>
  );
}
