import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      // See the stub's comment: the runtime guard is meaningless under vitest
      // and would otherwise make every server module untestable.
      "server-only": new URL("./vitest.server-only-stub.ts", import.meta.url).pathname,
    },
  },
});
