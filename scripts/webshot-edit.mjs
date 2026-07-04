// Drive the edit → select → suggest flow and screenshot the sheet.
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
await page.goto("http://localhost:3000/poems/set-102", { waitUntil: "networkidle" });
await page.getByText("suggest edits", { exact: true }).click();
await page.waitForTimeout(400);
// double-click a Vietnamese word in the first editable line to select it
const firstLine = page.locator(".vi .ProseMirror").first();
await firstLine.dblclick();
await page.waitForTimeout(500);
await page.screenshot({ path: "/Users/doug/ongs_poems/verification/web-edit.png", fullPage: false });
await browser.close();
console.log("shot web-edit");
