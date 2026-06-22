import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { AuthProvider } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { BrandScrubber } from "@/components/BrandScrubber";

import appCss from "../styles.css?url";
import irmLogo from "@/assets/logo-irm.jpeg.asset.json";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Convertipap · Control de Calidad" },
      { name: "description", content: "Sistema empresarial Convertipap" },
      { name: "author", content: "Convertipap" },
      { property: "og:title", content: "Convertipap · Control de Calidad" },
      { property: "og:description", content: "Sistema empresarial Convertipap" },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://www.convertipap.site/favicon.png" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Convertipap" },
      { name: "twitter:title", content: "Convertipap · Control de Calidad" },
      { name: "twitter:description", content: "Sistema empresarial Convertipap" },
      { name: "twitter:image", content: "https://www.convertipap.site/favicon.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "shortcut icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    // Redirige el dominio publicado *.lovable.app al dominio personalizado.
    // Excluye el preview de edición (id-preview--*) para no romper el editor.
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      const isLovableHost = host.endsWith(".lovable.app");
      const isPreviewHost = host.startsWith("id-preview--");
      if (isLovableHost && !isPreviewHost) {
        const target = `https://www.convertipap.site${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.location.replace(target);
        return;
      }
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      if (event === "SIGNED_OUT") {
        void queryClient.cancelQueries();
        queryClient.clear();
        router.invalidate();
        return;
      }
      router.invalidate();
      queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster richColors position="top-right" />
        <BrandScrubber />
        <div
          className="pointer-events-none fixed bottom-2 left-1/2 z-50 flex -translate-x-1/2 select-none items-center rounded-full bg-background/70 px-2.5 py-1 shadow-sm backdrop-blur-sm ring-1 ring-border/40"
        >
          <img src={irmLogo.url} alt="IRM Intelligence" className="h-5 w-auto object-contain" />
        </div>
      </AuthProvider>
    </QueryClientProvider>
  );
}
