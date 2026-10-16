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
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);

  await page.evaluate(async () => {
    const {Drone} = await import('./audio.js');
    const move = Drone.prototype.move;
    Drone.prototype.move = function(notes){window.adoptedNotes=[...notes];return move.call(this,notes);};
    const fill = CanvasRenderingContext2D.prototype.fillText;
    window.pitchLabels=[];
    CanvasRenderingContext2D.prototype.fillText=function(text,...args){if(/^\d · /.test(text))window.pitchLabels.push(text);return fill.call(this,text,...args);};
    const connect = AudioNode.prototype.connect;
    window.audioCounts = {osc:0, contexts:0};
    const create = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function(){window.audioCounts.osc++; window.audioCtx = this; return create.call(this);};
    AudioNode.prototype.connect = function(dest,...args){
      if(dest instanceof AudioDestinationNode){const mute=dest.context.createGain();mute.gain.value=0;connect.call(this,mute);return connect.call(mute,dest,...args);}
      return connect.call(this,dest,...args);
    };
  });
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor),'rgb(23, 18, 30)');
  await page.locator('#auto-texture').uncheck();
  await page.locator('#auto-texture').check();
  await page.locator('#start').click();
  await page.waitForTimeout(1600);
  assert.match(await page.locator('#status').textContent(),/DRIFTING/);
  console.log('started');
  await page.locator('#history summary').click();
  await page.waitForFunction(()=>document.querySelectorAll('#history-list li').length===2);
  assert.equal(await page.locator('#history-list li').count(),2);
  assert.match(await page.locator('#history-list').textContent(),/E2.*B2.*E3/);
  console.log('history visible');
  const osc = await page.evaluate(()=>audioCounts.osc);
  const initial = await page.locator('.knob input').evaluateAll(es=>es.map(e=>e.value).join(','));
  await page.waitForTimeout(14000);
  assert.notEqual(await page.locator('.knob input').evaluateAll(es=>es.map(e=>e.value).join(',')),initial);
  assert.equal(await page.evaluate(()=>audioCounts.osc),osc);
  assert.ok(await page.evaluate(async()=>{const {note}=await import('./music.js');return adoptedNotes.length===6 && pitchLabels.slice(-6).every((label,i)=>label===(6-i)+' · '+note(adoptedNotes[i]));}));
  assert.ok((await page.locator('#history-list li').count())>2);
  await page.locator('#history .close-panel').click();
  await page.locator('#stop').click();
  const stopped = await page.locator('#elapsed').textContent();
  await page.waitForTimeout(1700);
  assert.equal(await page.locator('#elapsed').textContent(),stopped);
  await page.locator('#start').click();
  await page.waitForTimeout(1600);
  assert.notEqual(await page.locator('#elapsed').textContent(),stopped);
  console.log('stop/resume pass');
  await page.evaluate(() => { void audioCtx.suspend(); });
  const paused = await page.locator('#elapsed').textContent();
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('#elapsed').textContent(), paused);
  await page.locator('#start').click();
  await page.waitForTimeout(1200);
  assert.notEqual(await page.locator('#elapsed').textContent(), paused);
  const beforeHiddenOsc = await page.evaluate(()=>audioCounts.osc);
  await page.evaluate(() => {Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  const hidden = await page.locator('#elapsed').textContent();
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(()=>audioCtx.state),'running');
  assert.equal(await page.evaluate(()=>audioCounts.osc),beforeHiddenOsc);
  await page.evaluate(() => {Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForTimeout(1600);
  assert.notEqual(await page.locator('#elapsed').textContent(), hidden);
  await page.locator('#stop').click();
  for(const [width,height] of [[1440,900],[1366,768],[390,844]]) {
    await page.evaluate(()=>{for(const p of document.querySelectorAll('details'))p.open=false});
    console.log('viewport',width,height);
    await page.setViewportSize({width,height});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(width>950) assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),'desktop scroll');
    await page.locator('.sound-details:not(#history) summary').click();
    assert.equal(await page.locator('.knob input').count(),27);
    for(const el of await page.locator('.knob input').all()) {await el.evaluate(e=>{e.value=e.min;e.dispatchEvent(new Event('input',{bubbles:true}));});}
    await page.locator('#knob-inharmonicity').evaluate(e=>{e.value='0.8';e.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.equal(await page.locator('#value-inharmonicity').textContent(),'80%');
    if(width>950) assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),'expanded scroll');
    await page.locator('#texture-panel .close-panel').click();
    await page.locator('#history summary').click();
    if(process.env.OUTPUT_DIR) await page.screenshot({path:`${process.env.OUTPUT_DIR}/autodrift-${width}.png`,fullPage:true});
  }
  // 1366×768 at browser 125% zoom exposes approximately 1093×614 CSS pixels.
  await page.setViewportSize({width:1093,height:614});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),'125% scroll');
  await page.locator('#history .close-panel').click();
  await page.locator('#reset').click();
  await page.locator('#history summary').click();
  await page.waitForFunction(()=>document.querySelectorAll('#history-list li').length===0);
  await page.locator('#history .close-panel').click();
  await page.locator('#start').click();
  await page.locator('#history summary').click();
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('#history-list li').count(),2);
  assert.deepEqual(errors, []);
 console.log("AutoDrift UI / audio start, moving knobs, fixed oscillator count, stop-resume, desktop/mobile: PASS");
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
