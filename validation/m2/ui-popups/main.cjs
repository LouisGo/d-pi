const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    width: 1178,
    height: 814,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const run = (code) => window.webContents.executeJavaScript(code);
  const output = process.argv[3];
  if (output) mkdirSync(output, { recursive: true });
  const results = [];
  const click = async (selector) => {
    const point = await run(
      "(() => {const e=document.querySelector(" +
        JSON.stringify(selector) +
        ");if(!e)throw Error('missing control');const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,hit:e.contains(document.elementFromPoint(x,y))};})()",
    );
    assert.ok(point.hit, "Pointer target is occluded: " + selector);
    for (const type of ["mouseMove", "mouseDown", "mouseUp"])
      window.webContents.sendInputEvent({
        type,
        x: Math.round(point.x),
        y: Math.round(point.y),
        button: "left",
        clickCount: 1,
      });
    await delay(350);
  };
  try {
    await window.loadURL(process.argv[2]);
    await delay(1000);
    for (const [theme, width, height] of [
      ["light", 1178, 814],
      ["dark", 885, 647],
    ]) {
      window.setSize(width, height);
      await run(
        "document.documentElement.dataset.theme=" + JSON.stringify(theme),
      );
      for (const label of ["Scope", "Search scope"]) {
        const trigger = '[aria-label="' + label + '"]';
        for (const [value, text] of [
          ["global", "Global"],
          ["thread", "Current project"],
        ]) {
          await click(trigger);
          const geometry = await run(
            "(() => {const e=document.querySelector('.ui-select-popup'),r=e.getBoundingClientRect(),s=getComputedStyle(e),p=getComputedStyle(e.parentElement);return {width:r.width,height:r.height,opacity:s.opacity,parentOpacity:p.opacity,visibility:s.visibility,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};})()",
          );
          results.push({ theme, width, height, label, value, geometry });
          assert.ok(
            geometry.width > 10 &&
              geometry.height > 10 &&
              geometry.opacity === "1" &&
              geometry.parentOpacity === "1" &&
              geometry.visibility === "visible" &&
              geometry.hit,
            "Select must be painted and receive pointer input",
          );
          if (output && label === "Scope" && value === "global")
            writeFileSync(
              join(output, theme + "-select.png"),
              (await window.webContents.capturePage()).toPNG(),
            );
          await click('.ui-select-popup [data-value="' + value + '"]');
          assert.ok(
            (
              await run(
                "document.querySelector(" +
                  JSON.stringify(trigger) +
                  ").textContent",
              )
            ).includes(text),
          );
        }
        await click(trigger);
        for (const type of ["keyDown", "keyUp"])
          window.webContents.sendInputEvent({ type, keyCode: "Escape" });
        await delay(350);
        assert.equal(
          await run("!!document.querySelector('.ui-select-popup')"),
          false,
        );
        assert.equal(
          await run(
            "document.activeElement === document.querySelector(" +
              JSON.stringify(trigger) +
              ")",
          ),
          true,
        );
        assert.equal(
          await run("document.querySelector('.ui-settings-modal').hidden"),
          false,
        );
      }
      await click("#model-trigger");
      for (const long of [false, true]) {
        if (long) await click(".model-picker-footer button");
        const rail = await run(
          "(() => {const e=document.querySelector('.model-picker-rail');return {scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight};})()",
        );
        results.push({ theme, long, rail });
        assert.ok(
          rail.scrollWidth <= rail.clientWidth,
          "Rail buttons must fit without horizontal overflow",
        );
        if (long) {
          assert.ok(
            rail.scrollHeight > rail.clientHeight,
            "Long provider rail must retain vertical scrolling",
          );
          await run(
            "document.querySelector('.model-picker-rail').scrollTop=100000",
          );
          await click('[aria-label="provider-29"]');
          assert.equal(
            await run(
              "document.querySelector('[aria-label=\"provider-29\"]').getAttribute('aria-pressed')",
            ),
            "true",
          );
          await click(".model-picker-footer button");
        }
      }
      for (const type of ["keyDown", "keyUp"])
        window.webContents.sendInputEvent({ type, keyCode: "Escape" });
      await delay(350);
    }
    if (output)
      writeFileSync(
        join(output, "ui-popups.json"),
        JSON.stringify(
          {
            platform: process.platform,
            electron: process.versions.electron,
            results,
          },
          null,
          2,
        ),
      );
    console.log(JSON.stringify(results));
    console.log(
      "PASS: pointer selection, Escape/focus, light/dark sizes, short/long model rail in Electron Chromium",
    );
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
