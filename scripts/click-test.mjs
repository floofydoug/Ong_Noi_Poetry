// Reproduce: click the "Bát Tràng" card from the gallery and report what happens.
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
const statuses = [];
page.on("response", (r) => {
  const u = r.url();
  if (u.includes("/poems/") || u.endsWith(":8000/")) statuses.push(`${r.status()} ${u}`);
});
page.on("console", (m) => { if (m.type() === "error") console.log("  [console error]", m.text()); });

await page.goto("http://localhost:8000/", { waitUntil: "networkidle" });

const link = page.locator("a.pcard", { hasText: "Bát Tràng" });
const count = await link.count();
const href = count ? await link.first().getAttribute("href") : "(link not found)";
console.log("card count:", count, "| href:", href);

if (count) {
  await link.first().click();
  await page.waitForLoadState("networkidle");
  const url = page.url();
  const bodyText = (await page.locator("body").innerText()).slice(0, 200).replace(/\n/g, " ");
  const is404 = /404|not found|could not be found/i.test(bodyText);
  console.log("after click URL:", url);
  console.log("looks like 404?:", is404);
  console.log("page text:", bodyText);
}
console.log("responses seen:", statuses.join(" | ") || "(none captured)");
await browser.close();
