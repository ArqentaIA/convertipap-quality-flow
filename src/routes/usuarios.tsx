import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { Search, Shield, Lock, Mail, User2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  asignarRol,
  quitarRol,
  agregarModuloARol,
  quitarModuloDeRol,
} from "@/lib/usuarios-roles.functions";
import { useAuth, type AppRole, type AppModule } from "@/lib/auth";

export const Route = createFileRoute("/usuarios")({ component: UsuariosPage });

type UsuarioFila = {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
  roles: AppRole[];
  modulos: AppModule[];
  /** Excepciones por usuario: grant = acceso extra, deny = acceso removido del rol */
  overrides: Partial<Record<AppModule, "grant" | "deny">>;
};

const ROL_LABEL: Record<AppRole, string> = {
  administrador: "Administrador",
  direccion_general: "Dirección General",
  gerente_general: "Gerente General",
  direccion: "Dirección",
  calidad: "Calidad",
  calidad_operativo: "Calidad Operativo",
  capturista: "Capturista",
  reportes_consulta: "Reportes / Consulta",
  planeacion: "Planeación",
  pesaje_operativo: "Pesaje Operativo",
  operador: "Operador",
};

const ROL_COLORS: Record<AppRole, string> = {
  administrador: "bg-primary/15 text-primary border-primary/30",
  direccion_general: "bg-primary/20 text-primary border-primary/40",
  gerente_general: "bg-primary/10 text-primary border-primary/25",
  direccion: "bg-accent text-accent-foreground border-border",
  calidad: "bg-success/15 text-success border-success/30",
  calidad_operativo: "bg-success/10 text-success border-success/25",
  capturista: "bg-muted text-foreground/80 border-border",
  reportes_consulta: "bg-accent text-accent-foreground border-border",
  planeacion: "bg-primary/10 text-primary border-primary/25",
  pesaje_operativo: "bg-muted text-foreground/80 border-border",
  operador: "bg-muted text-foreground/80 border-border",
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
  catalogos: "Catálogos",
  ordenes_produccion: "Órdenes de Producción",
  pesaje_bobina_madre: "Pesaje de Rollo",
  pesaje_cintas: "Pesaje de Cintas",


};

function UsuariosPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [usuarios, setUsuarios] = useState<UsuarioFila[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [modsPorRol, setModsPorRol] = useState<Record<string, AppModule[]>>({});
  const doAsignar = useServerFn(asignarRol);
  const doQuitar = useServerFn(quitarRol);
  const doAddMod = useServerFn(agregarModuloARol);
  const doDelMod = useServerFn(quitarModuloDeRol);

  async function cambiarModulo(
    role: AppRole,
    module: AppModule,
    accion: "add" | "remove",
  ) {
    setBusy(`mod:${role}:${module}`);
    try {
      if (accion === "add") await doAddMod({ data: { role, module } });
      else await doDelMod({ data: { role, module } });
      toast.success(accion === "add" ? "Módulo agregado" : "Módulo eliminado");
      setTick((t) => t + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar el módulo");
    } finally {
      setBusy(null);
    }
  }

  async function cambiarRol(
    userId: string,
    role: AppRole,
    accion: "add" | "remove",
  ) {
    setBusy(`${userId}:${role}`);
    try {
      if (accion === "add") await doAsignar({ data: { userId, role } });
      else await doQuitar({ data: { userId, role } });
      toast.success(accion === "add" ? "Rol asignado" : "Rol removido");
      setTick((t) => t + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar el rol");
    } finally {
      setBusy(null);
    }
  }

  // Excepciones de módulo por usuario (solo afectan a ese usuario).
  async function cambiarModuloUsuario(
    userId: string,
    module: AppModule,
    accion: "add" | "remove",
    overrides: Partial<Record<AppModule, "grant" | "deny">>,
  ) {
    setBusy(`umod:${userId}:${module}`);
    try {
      const actual = overrides[module];
      if (accion === "add") {
        // Si había un "deny", basta quitarlo; si no, se crea un "grant".
        if (actual === "deny") {
          const { error } = await supabase
            .from("user_module_overrides")
            .delete()
            .eq("user_id", userId)
            .eq("module", module);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("user_module_overrides")
            .upsert(
              { user_id: userId, module, action: "grant" },
              { onConflict: "user_id,module" },
            );
          if (error) throw error;
        }
      } else {
        // Si el acceso venía de un "grant", basta quitarlo; si venía del rol, se crea un "deny".
        if (actual === "grant") {
          const { error } = await supabase
            .from("user_module_overrides")
            .delete()
            .eq("user_id", userId)
            .eq("module", module);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("user_module_overrides")
            .upsert(
              { user_id: userId, module, action: "deny" },
              { onConflict: "user_id,module" },
            );
          if (error) throw error;
        }
      }
      toast.success(accion === "add" ? "Módulo habilitado" : "Módulo eliminado");
      setTick((t) => t + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar el módulo");
    } finally {
      setBusy(null);
    }
  }

  // Defensa adicional: si el usuario llega por URL directa sin permiso,
  // redirigir al primer módulo permitido (o /login si no tiene ninguno).
  // Perfiles y Roles: acceso exclusivo de adgral@convertipap.site.
  const tienePermiso =
    (auth.user?.email ?? "").toLowerCase() === "adgral@convertipap.site";

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
        const [perfilesRes, rolesRes, modsRes, ovrRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("id, email, nombre, activo")
            .order("nombre", { ascending: true }),
          supabase.from("user_roles").select("user_id, role"),
          supabase.from("module_permissions").select("role, module"),
          supabase.from("user_module_overrides").select("user_id, module, action"),
        ]);

        if (perfilesRes.error) throw perfilesRes.error;
        if (rolesRes.error) throw rolesRes.error;
        if (modsRes.error) throw modsRes.error;
        if (ovrRes.error) throw ovrRes.error;

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

        const ovrPorUsuario = new Map<
          string,
          Partial<Record<AppModule, "grant" | "deny">>
        >();
        for (const o of ovrRes.data ?? []) {
          const rec = ovrPorUsuario.get(o.user_id) ?? {};
          rec[o.module as AppModule] = o.action as "grant" | "deny";
          ovrPorUsuario.set(o.user_id, rec);
        }

        const filas: UsuarioFila[] = (perfilesRes.data ?? []).map((p) => {
          const userRoles = rolesPorUsuario.get(p.id) ?? [];
          const overrides = ovrPorUsuario.get(p.id) ?? {};
          const modSet = new Set<AppModule>();
          for (const rol of userRoles) {
            for (const m of modulosPorRol.get(rol) ?? []) modSet.add(m);
          }
          for (const [m, action] of Object.entries(overrides) as Array<
            [AppModule, "grant" | "deny"]
          >) {
            if (action === "deny") modSet.delete(m);
            else modSet.add(m);
          }
          return {
            id: p.id,
            nombre: p.nombre,
            email: p.email,
            activo: p.activo,
            roles: userRoles,
            modulos: Array.from(modSet),
            overrides,
          };
        });

        if (!cancelado) {
          setUsuarios(filas);
          setModsPorRol(
            Object.fromEntries(
              (Object.keys(ROL_LABEL) as AppRole[]).map((r) => [
                r,
                modulosPorRol.get(r) ?? [],
              ]),
            ),
          );
        }
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
  }, [tienePermiso, tick]);

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
      <AppLayout title="Perfiles y Roles">
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
          Verificando permisos…
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Perfiles y Roles">
      <div className="space-y-6">
        {/* Aviso de solo lectura */}
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-muted-foreground">
            Puedes <span className="font-semibold text-foreground">agregar o quitar roles</span> y
            <span className="font-semibold text-foreground"> quitar u otorgar módulos individuales</span> a
            cada usuario con la ✕ o el selector (solo afecta a ese usuario). El alta, baja y
            restablecimiento de contraseña se realiza desde el panel de administración del sistema.
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

        {/* Módulos por rol */}
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border p-4">
            <div className="text-sm font-semibold text-foreground">
              Módulos por rol
            </div>
            <div className="text-xs text-muted-foreground">
              Agrega o elimina los módulos (menús) que puede ver cada rol. El cambio
              aplica a todos los usuarios con ese rol.
            </div>
          </div>
          <div className="divide-y divide-border">
            {(Object.keys(ROL_LABEL) as AppRole[]).map((r) => {
              const mods = modsPorRol[r] ?? [];
              return (
                <div key={r} className="flex flex-wrap items-start gap-3 p-4">
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ROL_COLORS[r]}`}
                  >
                    <Shield className="h-3 w-3" />
                    {ROL_LABEL[r]}
                  </span>
                  <div className="flex flex-1 flex-wrap items-center gap-1">
                    {mods.length === 0 && (
                      <span className="text-xs italic text-muted-foreground">
                        sin módulos
                      </span>
                    )}
                    {mods.map((m) => (
                      <span
                        key={m}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground/80"
                      >
                        {MODULO_LABEL[m]}
                        <button
                          type="button"
                          title="Eliminar módulo"
                          disabled={busy === `mod:${r}:${m}`}
                          onClick={() => void cambiarModulo(r, m, "remove")}
                          className="rounded-full p-0.5 hover:bg-destructive/15 hover:text-destructive disabled:opacity-40"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <select
                      value=""
                      disabled={busy?.startsWith(`mod:${r}:`)}
                      onChange={(e) => {
                        const m = e.target.value as AppModule;
                        if (m) void cambiarModulo(r, m, "add");
                      }}
                      className="rounded-md border border-dashed border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">+ Agregar módulo</option>
                      {(Object.keys(MODULO_LABEL) as AppModule[])
                        .filter((m) => !mods.includes(m))
                        .map((m) => (
                          <option key={m} value={m}>
                            {MODULO_LABEL[m]}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
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
                          <div className="flex flex-wrap items-center gap-1">
                            {u.roles.length === 0 && (
                              <span className="text-xs italic text-muted-foreground">
                                sin rol
                              </span>
                            )}
                            {u.roles.map((r) => (
                              <span
                                key={r}
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ROL_COLORS[r]}`}
                              >
                                <Shield className="h-3 w-3" />
                                {ROL_LABEL[r]}
                                <button
                                  type="button"
                                  title="Quitar rol"
                                  disabled={busy === `${u.id}:${r}`}
                                  onClick={() => void cambiarRol(u.id, r, "remove")}
                                  className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/15 hover:text-destructive disabled:opacity-40"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                            <select
                              value=""
                              disabled={busy?.startsWith(u.id)}
                              onChange={(e) => {
                                const r = e.target.value as AppRole;
                                if (r) void cambiarRol(u.id, r, "add");
                              }}
                              className="rounded-md border border-dashed border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                              <option value="">+ Agregar rol</option>
                              {(Object.keys(ROL_LABEL) as AppRole[])
                                .filter((r) => !u.roles.includes(r))
                                .map((r) => (
                                  <option key={r} value={r}>
                                    {ROL_LABEL[r]}
                                  </option>
                                ))}
                            </select>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-wrap items-center gap-1">
                            {u.modulos.length === 0 && (
                              <span className="text-xs italic text-muted-foreground">
                                ninguno
                              </span>
                            )}
                            {u.modulos.map((m) => (
                              <span
                                key={m}
                                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground/80"
                              >
                                {MODULO_LABEL[m]}
                                <button
                                  type="button"
                                  title="Quitar acceso solo a este usuario"
                                  disabled={busy === `umod:${u.id}:${m}`}
                                  onClick={() =>
                                    void cambiarModuloUsuario(u.id, m, "remove", u.overrides)
                                  }
                                  className="rounded-full p-0.5 hover:bg-destructive/15 hover:text-destructive disabled:opacity-40"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                            <select
                              value=""
                              disabled={busy?.startsWith(`umod:${u.id}:`)}
                              onChange={(e) => {
                                const m = e.target.value as AppModule;
                                if (m)
                                  void cambiarModuloUsuario(u.id, m, "add", u.overrides);
                              }}
                              className="rounded-md border border-dashed border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                              <option value="">+ Agregar módulo</option>
                              {(Object.keys(MODULO_LABEL) as AppModule[])
                                .filter((m) => !u.modulos.includes(m))
                                .map((m) => (
                                  <option key={m} value={m}>
                                    {MODULO_LABEL[m]}
                                  </option>
                                ))}
                            </select>
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
