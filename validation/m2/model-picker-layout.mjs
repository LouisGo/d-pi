// Real Chromium geometry, isolated from App data, OMP and network providers.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";

const isolated = createTestEnvironment({ prefix: "d-pi-model-picker-layout-" });
const vite = await createServer({
  configFile: false,
  root: resolve("."),
  cacheDir: join(isolated.root, "vite-cache"),
  optimizeDeps: {
    entries: [resolve("validation/m2/model-picker-layout.html")],
  },
  plugins: [react(), tailwindcss()],
  server: { host: "127.0.0.1", port: 0, watch: null, hmr: false },
});
let child;
try {
  await vite.listen();
  const url = `http://127.0.0.1:${vite.httpServer.address().port}/validation/m2/model-picker-layout.html`;
  const main = join(isolated.root, "main.cjs");
  writeFileSync(
    main,
    `
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
app.setPath('userData', ${JSON.stringify(isolated.data)});
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 1120, height: 780, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  const evaluate = (code) => w.webContents.executeJavaScript(code);
  try {
    await w.loadURL(${JSON.stringify(url)});
    for (let n = 0; n < 200 && !await evaluate("!!document.querySelector('#choose-model')"); n++) await new Promise(done => setTimeout(done, 50));
    const results = [];
    for (const [width, height] of [[1120,780], [800,600], [800,400]]) {
      w.setContentSize(width, height);
      for (const theme of ['light','dark']) {
        await evaluate("document.documentElement.dataset.theme=" + JSON.stringify(theme));
        await evaluate("scrollTo(0,0);document.querySelector('#reading').scrollTop=160;document.querySelector('#choose-model').click()");
        const samples = await evaluate(\`(async () => {
          const rows = [];
          for (let frame = 0; frame < 90; frame++) {
            await new Promise(done => requestAnimationFrame(done));
            const popup = document.querySelector('.ui-popover-popup');
            if (!popup) throw Error('Popup did not open');
            const rect = popup.getBoundingClientRect();
            rows.push({frame, y:rect.y, height:rect.height, scrollY, pageHeight:document.documentElement.scrollHeight, viewport:innerHeight, side:popup.dataset.side, position:getComputedStyle(popup.parentElement).position});
          }
          return rows;
        })()\`);
        console.log(JSON.stringify({ width, height, theme, scrollY: [...new Set(samples.map(s => s.scrollY))], pageHeight: [...new Set(samples.map(s => s.pageHeight))], settledY: [...new Set(samples.slice(30).map(s => s.y))] }));
        assert.ok(samples.every(s => s.scrollY === 0 && s.pageHeight === s.viewport), 'Opening must not expand or scroll the document');
        assert.equal(await evaluate("document.querySelector('#reading').scrollTop"), 160, 'Opening preserves conversation scroll');
        assert.equal(await evaluate("document.activeElement === document.querySelector('.model-picker-search input')"), true, 'Search receives focus');
        const settled = samples.slice(30);
        assert.ok(Math.max(...settled.map(s => s.y))-Math.min(...settled.map(s => s.y)) < 0.5, 'Popup must settle without oscillation');
        assert.ok(settled.every(s => s.y >= 0 && s.y+s.height <= s.viewport+0.5), 'Popup stays inside viewport');
        await evaluate("document.querySelector('.model-picker-list').scrollTop=200");
        await evaluate("new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))");
        assert.equal(await evaluate("scrollY"), 0, 'List scroll does not scroll document');
        assert.ok(await evaluate("document.querySelector('.model-picker-list').scrollTop > 0"), 'List remains scrollable');
        await evaluate("document.querySelector('.model-picker-search input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
        await new Promise(done => setTimeout(done, 250));
        assert.equal(await evaluate("document.activeElement.id"), 'choose-model', 'Escape restores focus');
        results.push({width,height,theme});
      }
    }
    console.log('PASS: model picker geometry ' + JSON.stringify(results));
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
`,
  );
  child = spawn(
    resolve("node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"),
    [main],
    { env: isolated.env, stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  const timeout = setTimeout(() => child.kill("SIGKILL"), 45000);
  const [code] = await once(child, "close");
  clearTimeout(timeout);
  if (code !== 0) process.exitCode = 1;
} finally {
  child?.kill();
  await vite.close();
  isolated.cleanup();
}
