import { chromium, defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const webkit = process.env.BIZ_BROWSER === "webkit";
const cachedChromium = join(homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell");
const chromiumPath = process.env.BIZ_CHROMIUM || (existsSync(chromium.executablePath()) ? undefined : existsSync(cachedChromium) ? cachedChromium : undefined);
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 45000,
  expect: { timeout: 12000 },
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile: `artifacts/verification/e2e-${webkit ? "webkit" : "chromium"}.json`,
      },
    ],
  ],
  use: {
    baseURL: "http://127.0.0.1:4317",
    headless: true,
    browserName: webkit ? "webkit" : "chromium",
    launchOptions: webkit
      ? {}
      : {
          executablePath: chromiumPath,
          args: ["--mute-audio"],
        },
    screenshot: "only-on-failure",
  },
});
