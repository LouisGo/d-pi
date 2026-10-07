# 06i body worker evidence

Workspace: /Users/louistation/.codex/worktrees/long-reading-body/d-pi
Branch: codex/long-reading-body
Product base: 6daf80ee25d8c45e03cb8ab1c8d7304f926ee187
Shared specification/i18n commit: 4fe4638 (cherry-pick of fb699c2)

## Actual red/green cycles

1. `pnpm test src/app/renderer/reading/bounded-reading-renderer.test.ts -t 'manually opens'`: 2 failed local/remembered cases because latest segment button missing; minimal button/navigation implementation then 2 passed.
2. `pnpm test src/app/renderer/reading/markdown.test.ts`: original mode switch failed first completed prefix DOM identity assertion. Same real Streamdown text changed streaming true to false, and resulting `p` was a different node. Minimal mode/parseIncomplete adjustment then the prefix Text node, Range, Selection and nested code scroll tests passed.
3. `pnpm test src/app/renderer/reading/markdown.test.ts -t 'reference link'`: after keeping block tree, late ordinary definition failed because corresponding rendered link absent; bounded whole-document definition scope then passed.
4. Escaped closing bracket definition exposed initial too-narrow definition regex; replaced it with conservative `text.includes("]:")`. Actual red raw log: /tmp/d-pi-reading-body-reference-red.log. Final escaped reference passed.

## Final verification

`pnpm test src/app/renderer/reading/markdown.test.ts src/app/renderer/reading/bounded-reading-renderer.test.ts src/app/renderer/reading/reading-segments.test.ts`: 3 files, 23 passed. Raw final log: /tmp/d-pi-reading-body-final-green.log.

`pnpm typecheck:renderer`: passed; /tmp/d-pi-reading-body-typecheck.log.
Scoped `pnpm exec biome check`: 4 files, no fixes; /tmp/d-pi-reading-body-biome.log.
`pnpm lint:design`, `pnpm lint:i18n`, `pnpm lint:interaction` and `git diff --check`: passed.

Real Markdown tests import Streamdown 2.6.0 and @streamdown/code 1.1.1, no mock. JS highlighter initialization is awaited by observing real highlighted tokens before recording completion DOM/Range/Selection/code scroll. Static parse comparisons use real Streamdown static mode for ordinary references, footnotes, table/escaped pipes/final cells and closed fences/interrupted inline delimiters. Known literal expectations verify meaning as well as the static comparison. Footnote/backlink and URL rendering still use existing inert app MarkdownLink policy.

## Installed implementation evidence

Official current feature reference: https://github.com/vercel/streamdown/blob/main/skills/streamdown/references/features.md
Final authority: installed node_modules/streamdown/dist/chunk-YOKDWASO.js, SHA-256 f48119d092b11246269a6d00e4e5f0e6d5ed98831a879cfdfad9e59d2916b2ba.

The `at=useMemo` expression invokes Fa (remend) only when `mode === "streaming" && parseIncompleteMarkdown`; false takes the received text unchanged. The static branch renders one jt parser tree while streaming renders keyed memoized Yn Blocks. Mode therefore chooses tree composition; completion now retains it while disabling incomplete-text repair.

No `animated` or `caret` prop is supplied. Streamdown's animation timeline allocation only runs under `ue` from its animated prop, and `isAnimating=false` disables incomplete code/caret state; this change adds no replay/animation queue. Other static-only distinction is dir=auto direction plugin (not set here) and animation callbacks (not used here).

Installed `parseMarkdownIntoBlocks` keeps footnote documents together using ba/ha regexes but not ordinary reference definitions. Conservative "]:" detection gives any potentially definition-bearing bounded short document one Markdown parser scope so escaped/multiline labels need no local grammar reimplementation. False positives only change this already-bounded parse scope; source bytes, grammar, budgets and dependencies remain unchanged.

## Boundaries

Latest segment appears only for multiple raw segments, resolves effective tail of current text and resets inner scrollTop even if already selected. Subsequent append does not change selected segment; shortened bodies clamp persistently, and later growth does not revive stale selection. Existing Thread/source keys and 128 body-position budget remain authoritative. Outer list navigation is untouched.

Completed ordinary unchanged Markdown prefix preserves nodes/Range/Selection and nested code scroll in real React/happy-dom. A late definition can change parse scope and the semantics of earlier blocks; affected nodes/selection are not promised stable. Short Markdown to raw representation change and unmount/remount similarly do not promise DOM/Selection survival. Existing raw remount restores page/scrollTop by source.

This worker did not run Electron UI, native clipboard, physical scrolling, or real provider requests. Parent owns pnpm dev, actual Chromium geometry, selection/clipboard and complete-loop validation. Happy-dom coordinates are not evidence of real Chromium layout.
