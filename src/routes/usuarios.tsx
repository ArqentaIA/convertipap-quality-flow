import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";
export const Route = createFileRoute("/usuarios")({
  component: () => <PlaceholderPage title="Usuarios y Permisos" desc="Gestión de operadores, analistas, jefes de máquina y roles por planta." />,
});
