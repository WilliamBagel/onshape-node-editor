import { defineConfig } from "vitest/config";

/**
 * Unit/golden tests for the app (issue #3 wires the runner; #5 needs it for the
 * graph round-trip harness). Node environment: the graph model and the
 * FeatureScript generator are DOM-free, only the editor UI needs a browser.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
