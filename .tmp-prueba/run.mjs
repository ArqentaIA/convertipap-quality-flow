import { createServer } from "vite";
import path from "path";
const server = await createServer({ configFile: false, root: process.cwd(), logLevel: "error", server: { middlewareMode: true, hmr: false },
  resolve: { alias: { "@": path.resolve("src") } }, appType: "custom" });
await server.ssrLoadModule("/.tmp-prueba/enviar.ts");
await server.close();
