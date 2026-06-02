import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/control-calidad")({
  component: () => <Navigate to="/calidad/captura" replace />,
});
