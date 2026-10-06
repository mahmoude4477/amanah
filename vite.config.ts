import vinext from "vinext";
import { defineConfig } from "vite";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { sites } from "./build/sites-vite-plugin";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";

// The newest compatibility date the locally installed Workers runtime (workerd 1.20260515) accepts. Used only by `pnpm dev`
// (below) and `pnpm start` (package.json); the deployed Worker keeps the date in wrangler.jsonc. Raise it together with wrangler
// and @cloudflare/vite-plugin.
export const LOCAL_COMPATIBILITY_DATE = "2026-05-22";

export default defineConfig(async ({ command }) => {
  // Use Miniflare's local Request.cf placeholder unless fetching is requested.
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.WRANGLER_REGISTRY_PATH ??= ".wrangler/dev-registry";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  // Dev only (optimizeDeps is not used by the build): the app depends on zod 3 while better-auth 1.7 brings its own zod 4. When
  // "zod" is pre-bundled in the Worker environments, Vite resolves every bare "zod" import to that one copy, better-auth's too, and
  // every auth call fails ("sessionSchema.loose is not a function": 500 on sign-in, /api and /amanah). Without pre-bundling each
  // package loads its own zod. tests/dev-config.test.mjs keeps this in place while the two versions differ.
  const workerDeps = { optimizeDeps: { exclude: ["zod"] } };

  return {
    environments: { rsc: workerDeps, ssr: workerDeps },
    server: {
      ...(managedLinux ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] } : {}),
      ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
    },
    plugins: [
      vinext(),
      // Keep Vinext's installed client shims together. Splitting them across
      // chunks can turn next/link's dynamic navigation import into a partial
      // module namespace, breaking prefetch and client-side navigation.
      {
        name: "vinext-client-shims-chunk",
        configEnvironment(name: string) {
          if (name !== "client") return;
          return {
            build: {
              rolldownOptions: {
                output: {
                  codeSplitting: {
                    groups: [{
                      name: "vinext-shims",
                      test: /[\\/]node_modules[\\/]vinext[\\/]dist[\\/]shims[\\/]/,
                    }],
                  },
                },
              },
            },
          };
        },
      },
      sites({ mockAuth: !managedLinux }),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        // Workers AI (the explanation) has no local simulation: by default local dev reaches it through the developer's `wrangler login`,
        // which may incur usage. AMANAH_DEV_LOCAL_ONLY=1 starts without any remote connection; explanations are then «unavailable» and
        // the model decision is unaffected.
        remoteBindings: process.env.AMANAH_DEV_LOCAL_ONLY !== "1",
        // Dev server only: the build (and so the deploy) keeps wrangler.jsonc's production date.
        ...(command === "serve" ? { config: { compatibility_date: LOCAL_COMPATIBILITY_DATE } } : {}),
      }),
    ],
  };
});
