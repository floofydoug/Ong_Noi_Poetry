// Screenshot running web app pages. Usage: node scripts/webshot.mjs <url> <outname> [--mobile]
import { chromium } from "playwright";

const [url, out, flag] = process.argv.slice(2);
if (!url || !out) { console.error("usage: node scripts/webshot.mjs <url> <outname> [--mobile]"); process.exit(1); }
const mobile = flag === "--mobile";

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: mobile ? { width: 402, height: 874 } : { width: 1400, height: 1000 },
  deviceScaleFactor: 2,
  isMobile: mobile,
  hasTouch: mobile,
});
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.screenshot({ path: `/Users/doug/ongs_poems/verification/${out}.png`, fullPage: true });
await browser.close();
console.log("shot", out);
