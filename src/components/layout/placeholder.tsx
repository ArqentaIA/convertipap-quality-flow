import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { Construction } from "lucide-react";

function makePlaceholder(title: string, desc: string) {
  return function Page() {
    return (
      <AppLayout title={title}>
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Construction className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">{title}</h2>
          <p className="mt-2 max-w-md mx-auto text-sm text-muted-foreground">{desc}</p>
        </div>
      </AppLayout>
    );
  };
}

export const Page = makePlaceholder("", "");
