import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";

// Consume only the components used by this app. Keep the upstream files intact.
const source = resolve(process.env.HONG_DESIGN_SYSTEM || "../hong-designsystem");
const target = resolve("src/design-system/vendor");
const components = ["page-app", "page-auth", "nav-rail", "bottom-nav", "block-list",
  "description-list", "button", "icon-button", "input", "native-select", "field", "form",
  "dialog", "sheet", "badge", "alert", "switch", "pagination", "search-box", "toolbar"];
const files = ["seed.css", "tokens.css", "base.css", ...components.map(name => `c/${name}.css`)];
const manifest = {};
const check = process.argv.includes("--check");
for (const file of files) {
  const bytes = readFileSync(resolve(source, "assets/css/ui", file));
  const dest = resolve(target, file);
  if (check) {
    if (!readFileSync(dest).equals(bytes)) throw new Error(`원본과 다른 Inkpress CSS: ${file}`);
  } else {
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, bytes);
  }
  manifest[file] = createHash("sha256").update(bytes).digest("hex");
}
if (check) {
  console.log(`Inkpress UI 원본 일치: ${files.length}/${files.length}`);
  process.exit(0);
}
writeFileSync(resolve(target, "index.css"), files.map(file => `@import "./${file}";`).join("\n") + "\n");
writeFileSync(resolve(target, "manifest.json"), JSON.stringify({ source: "hong-designsystem/assets/css/ui", files: manifest }, null, 2) + "\n");
console.log(`Inkpress UI: ${files.length}개 원본 CSS 동기화`);
