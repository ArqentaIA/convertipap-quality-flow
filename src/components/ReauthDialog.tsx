import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Llamado tras validar credenciales correctamente. */
  onConfirm: () => void | Promise<void>;
  /** Texto del título. */
  title?: string;
  description?: string;
}

/**
 * Modal de doble validación electrónica.
 * Pide la contraseña actual del usuario logueado y re-valida con
 * `signInWithPassword` antes de permitir una acción crítica
 * (cambio de estatus de rollo, dictamen, etc.).
 */
export function ReauthDialog({
  open,
  onOpenChange,
  onConfirm,
  title = "Confirmar identidad",
  description = "Esta acción afecta el estatus de un rollo. Vuelve a ingresar tu contraseña para confirmar que eres tú.",
}: Props) {
  const auth = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    if (!auth.user?.email) {
      setError("No hay sesión activa.");
      return;
    }
    if (!password) {
      setError("Ingresa tu contraseña.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: auth.user.email,
        password,
      });
      if (error) {
        setError("Contraseña incorrecta.");
        return;
      }
      await onConfirm();
      setPassword("");
      onOpenChange(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error de validación.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Usuario</Label>
            <Input value={auth.user?.email ?? ""} readOnly className="bg-muted" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Contraseña</Label>
            <Input
              type="password"
              value={password}
              autoFocus
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handle(); }}
              disabled={busy}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => void handle()} disabled={busy || !password}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
