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
  const page = await browser.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}`);

  await page.evaluate(() => {
    const connect = AudioNode.prototype.connect;
    window.audioCounts = {osc:0, contexts:0};
    const create = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function(){window.audioCounts.osc++; window.audioCtx = this; return create.call(this);};
    AudioNode.prototype.connect = function(dest,...args){
      if(dest instanceof AudioDestinationNode){const mute=dest.context.createGain();mute.gain.value=0;connect.call(this,mute);return connect.call(mute,dest,...args);}
      return connect.call(this,dest,...args);
    };
  });
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor),'rgb(16, 21, 29)');
  await page.locator('#start').click();
  await page.waitForTimeout(1600);
  assert.match(await page.locator('#status').textContent(),/DRIFTING/);
  const osc = await page.evaluate(()=>audioCounts.osc);
  const initial = await page.locator('.knob input').evaluateAll(es=>es.map(e=>e.value).join(','));
  await page.waitForTimeout(14000);
  assert.notEqual(await page.locator('.knob input').evaluateAll(es=>es.map(e=>e.value).join(',')),initial);
  assert.equal(await page.evaluate(()=>audioCounts.osc),osc);
  await page.locator('#stop').click();
  const stopped = await page.locator('#elapsed').textContent();
  await page.waitForTimeout(1700);
  assert.equal(await page.locator('#elapsed').textContent(),stopped);
  await page.locator('#start').click();
  await page.waitForTimeout(1600);
  assert.notEqual(await page.locator('#elapsed').textContent(),stopped);
  await page.evaluate(() => audioCtx.suspend());
  const paused = await page.locator('#elapsed').textContent();
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('#elapsed').textContent(), paused);
  await page.locator('#start').click();
  await page.waitForTimeout(1200);
  assert.notEqual(await page.locator('#elapsed').textContent(), paused);
  await page.evaluate(() => {Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  const hidden = await page.locator('#elapsed').textContent();
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('#elapsed').textContent(),hidden);
  await page.evaluate(() => {Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForTimeout(1600);
  assert.notEqual(await page.locator('#elapsed').textContent(), hidden);
  await page.locator('#stop').click();
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(process.env.OUTPUT_DIR) await page.screenshot({path:`${process.env.OUTPUT_DIR}/autodrift-${width}.png`,fullPage:true});
  }
  assert.deepEqual(errors, []);
 console.log("AutoDrift UI / audio start, moving knobs, fixed oscillator count, stop-resume, desktop/mobile: PASS");
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
