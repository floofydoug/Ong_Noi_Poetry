// Playwright driver: open each verification/<scan_id>.html and screenshot it full-page.
// Usage: node scripts/screenshot.mjs set-102 [set-001 ...]
import { chromium } from "playwright";
import { pathToFileURL } from "url";
import path from "path";
import fs from "fs";

const ids = process.argv.slice(2);
if (!ids.length) { console.error("usage: node scripts/screenshot.mjs <scan_id> ..."); process.exit(1); }

const ROOT = "/Users/doug/ongs_poems/verification";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 2 });

for (const id of ids) {
  const htmlPath = path.join(ROOT, `${id}.html`);
  if (!fs.existsSync(htmlPath)) { console.error(`missing ${htmlPath}`); continue; }
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
  const out = path.join(ROOT, `${id}.png`);
  await page.screenshot({ path: out, fullPage: true });
  console.log(`shot ${out}`);
}
await browser.close();
