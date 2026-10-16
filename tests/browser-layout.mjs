import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const port = Number(process.env.PORT || 8787);
const server = createServer(async (req, res) => {
  try {
    const path = req.url.split("?")[0];
    res.setHeader(
      "Content-Type",
      path.endsWith(".js")
        ? "text/javascript"
        : path.endsWith(".css")
          ? "text/css"
          : "text/html",
    );
    res.end(
      await readFile(
        new URL(".." + (path === "/" ? "/index.html" : path), import.meta.url),
      ),
    );
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(port, "127.0.0.1", r));
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.locator('#start').click();await page.waitForTimeout(1600);
 for(const [width,height] of [[1440,900],[1366,768],[390,844],[1093,614]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>{for(const p of document.querySelectorAll('details'))p.open=false});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(width>950) assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1));
  await page.screenshot({path:`${process.env.OUTPUT_DIR}/main-${width}.png`,fullPage:width>950});
  await page.locator('#texture-panel summary').click();
  for(const group of ['SPECTRUM','SPACE','COLOR','ENVELOPE']){
   await page.locator('#tab-'+group).click();
   assert.ok(await page.locator('.detail-inner').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'drawer needs scrolling');
   assert.ok(await page.locator('.knob:not([hidden]) input').evaluateAll(es=>es.every(e=>{const r=e.getBoundingClientRect();return r.bottom<=innerHeight && r.left>=0})));
  }
  await page.screenshot({path:`${process.env.OUTPUT_DIR}/texture-${width}.png`,fullPage:width>950});
 }
 console.log('Main and all four texture tabs: layout PASS');
}finally{await browser.close();await new Promise(r=>server.close(r));}
