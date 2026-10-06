# Attention harness preparation evidence

Fixed base: `3cbff7e`.
Written scope: `validation/m2/attention.mjs`, `validation/m2/package.mjs` only.
The production attention implementation and GUI are absent at this fixed base; no packaged pass is claimed by this preparation.

- `supplier-localhost-check.txt`: actual localhost HTTP held-response transport fixture, HTTP400 + three success modes. It checks the harness fixture, not the production SDK/runtime/notification path.
- `attention-syntax.txt`, `package-syntax.txt`: `node --check` exits 0 with no output.
- `biome-check.txt`: existing repository Biome checked the two allowed scripts.

Candidate command after integration/build:

```sh
node validation/m2/package.mjs /absolute/candidate/d-pi.app --attention --attention-inspect
```

`--attention` checks real extension `ctx.ui.confirm`, real fixed-SDK localhost provider failures/completion, shipped bridge, GUI controls, reload dedup and cold preferences. `--attention-inspect` additionally holds native checkpoints for root Computer Use; it never substitutes a Notification adapter.

Each native checkpoint prints JSON with `checkpoint`, `evidenceFile`, `resumeFile`, and `expiresAt`. Write the actually observed result to evidenceFile (`{"status":"observed|unavailable|unknown","notes":"concrete native evidence"}`), then create resumeFile before the deadline.

Order:

1. `background`: put another App in the foreground without quitting the isolated d-pi App; response stays held until resume.
2. `display-click`: inspect actual Notification Center and click actual completion notification. Only both actual display and actual click qualify as observed; observed requires shipped Main `openRequest` and correct Thread/result. OS permission/code-signing failures must be recorded unavailable/unknown.
3. `close-window`: close native window without quitting; actual response stays held until resume. This scenario requires observed window absence.
4. `reopen`: reopen same running App from Dock; require observed and same Main instance/retained completed entry/no second provider call.

`attention-result.json` and global `m2-result.json` preserve separate fixture, application and native evidence tiers. Default `--attention` without inspect records native as not-exercised. A stale event public `seen` command is checked; it is not a native stale-notification-click proof. The actual old Thread cold read-only baseline remains part of the existing package harness.
