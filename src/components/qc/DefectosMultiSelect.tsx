import { Check, ChevronsUpDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/**
 * Multiselección de defectos visuales y de conversión.
 * - Permite 1..N defectos.
 * - "Sin hallazgo" es mutuamente excluyente: al elegirlo se limpia la selección;
 *   al elegir cualquier defecto se desmarca automáticamente.
 * - El valor canónico es un arreglo de strings (columna muestras_calidad.defectos).
 */
export function DefectosMultiSelect({
  options,
  value,
  onChange,
  disabled,
  max = 20,
  placeholder = "— Sin hallazgo —",
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
  max?: number;
  placeholder?: string;
}) {
  const sinHallazgo = value.length === 0;

  const toggle = (d: string) => {
    if (value.includes(d)) {
      onChange(value.filter((x) => x !== d));
      return;
    }
    if (value.length >= max) return;
    // Seleccionar un defecto desmarca automáticamente "Sin hallazgo".
    onChange([...value, d]);
  };

  return (
    <div className="space-y-1.5">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="h-11 w-full justify-between text-base font-normal"
          >
            <span className={cn("truncate", sinHallazgo && "text-muted-foreground")}>
              {sinHallazgo
                ? placeholder
                : `${value.length} defecto${value.length === 1 ? "" : "s"} seleccionado${value.length === 1 ? "" : "s"}`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
          collisionPadding={12}
          avoidCollisions
        >
          <div
            className="overflow-y-auto overscroll-contain"
            style={{
              maxHeight: "min(60vh, var(--radix-popover-content-available-height, 60vh))",
              WebkitOverflowScrolling: "touch",
            }}
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            <div className="p-1">
              <button
                type="button"
                onClick={() => onChange([])}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent"
              >
                <span className="flex h-4 w-4 items-center justify-center">
                  {sinHallazgo && <Check className="h-4 w-4 text-primary" />}
                </span>
                <span className={cn(sinHallazgo && "font-semibold")}>— Sin hallazgo —</span>
              </button>
              <div className="my-1 h-px bg-border" />
              {options.map((d) => {
                const checked = value.includes(d);
                return (
                  <label
                    key={d}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(d)}
                      disabled={!checked && value.length >= max}
                    />
                    <span className={cn(checked && "font-medium")}>{d}</span>
                  </label>
                );
              })}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((d) => (
            <Badge key={d} variant="secondary" className="gap-1 py-1 text-xs">
              {d}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(value.filter((x) => x !== d))}
                aria-label={`Quitar ${d}`}
                className="rounded-full p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
