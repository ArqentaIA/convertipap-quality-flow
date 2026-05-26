import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";
export const Route = createFileRoute("/catalogos")({
  component: () => <PlaceholderPage title="Catálogos" desc="Plantas, máquinas, productos, variables y rangos de especificación." />,
});
