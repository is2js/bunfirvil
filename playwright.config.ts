import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173/bunfirvil/";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  // GitHub's software WebGL runner needs more time than a local GPU for four
  // full structure rebuilds, 83 lazy palette previews and both 3D drag paths.
  // The complete showcase currently reaches the final editor actions after
  // roughly eleven minutes on hosted runners, so keep a bounded 15-minute gate.
  timeout: 900_000,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "retain-on-failure",
    launchOptions: {
      args: ["--use-gl=swiftshader", "--enable-webgl"],
    },
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
