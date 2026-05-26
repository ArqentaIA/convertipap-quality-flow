import { Check } from "lucide-react";

export interface Step { id: number; title: string; subtitle: string }

export function StepperWizard({ steps, current, onGo }: { steps: Step[]; current: number; onGo: (n: number) => void }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <ol className="flex items-center gap-2">
        {steps.map((s, i) => {
          const done = current > s.id;
          const active = current === s.id;
          return (
            <li key={s.id} className="flex flex-1 items-center gap-3">
              <button
                onClick={() => onGo(s.id)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                  active ? "bg-primary/10" : "hover:bg-accent"
                }`}
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
                    done
                      ? "bg-success text-success-foreground"
                      : active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="h-4 w-4" /> : s.id}
                </span>
                <div className="hidden sm:block">
                  <div className={`text-sm font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}>{s.title}</div>
                  <div className="text-[11px] text-muted-foreground">{s.subtitle}</div>
                </div>
              </button>
              {i < steps.length - 1 && (
                <div className={`h-[2px] flex-1 rounded-full ${done ? "bg-success" : "bg-border"}`} />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
