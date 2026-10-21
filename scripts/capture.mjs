import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/Users/kh/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell",
  args: ["--mute-audio"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto("http://127.0.0.1:4317");
await page.waitForTimeout(12000);
console.log(
  JSON.stringify({
    errors,
    world: await page.evaluate(() => window.__bizWorld),
    text: (await page.locator("body").innerText()).slice(0, 1000),
  }),
);
await page.screenshot({ path: "artifacts/verification/desktop-initial.png" });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1500);
await page.screenshot({ path: "artifacts/verification/mobile-initial.png" });
await browser.close();
