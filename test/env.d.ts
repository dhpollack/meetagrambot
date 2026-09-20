import type { Env as WorkerEnv } from "../src/index";

declare module "cloudflare:test" {
  // worker-configuration.d.ts is generated from wrangler.jsonc and so knows
  // nothing about the secrets; src/index.ts declares the full shape.
  interface ProvidedEnv extends WorkerEnv {}
}
