# Actual parallel mini execution

Original flow delivery: `codex/flow` at `7bcea5662a6ff7a352798df9e2d5056d82226f5a`, clean. This supplemental mini stays on `codex/parallel-mini`; original flow issues05/06/07 remain unchanged.

Two actual worker subagents were dispatched before either target implementation started. Both independently verified their fixed base `ba096ffc120a7b59f8bb383f3398fec8bfa8ddea`, branch, canonical absolute cwd and initial clean status.

- Right ready: `2026-10-06T02:42:45.869Z`, canonical cwd ending `-mini-right`, agent `/root/forward_test/mini_right`.
- Left ready: `2026-10-06T02:42:59.469Z`, canonical cwd ending `-mini-left`, agent `/root/forward_test/mini_left`.

Main sent each `go-red` after both ready messages, authorizing only each worker's separate module/test/evidence set. Workers will report actual red/green phase timestamps; coordination waits are not evidence of simultaneous code writing. Main alone writes this record, spec/ticket states and integration history.

Both real workers progressed during the same dispatched task period. Exact tiny write/test operations naturally occurred at different times: right green interval `02:44:53.413Z–02:44:53.526Z`, left `02:45:09.133Z–02:45:09.227Z`; these are not claimed to overlap. Worker reports preserve waits separately.

Main additionally launched both unchanged target node:test commands with `Promise.allSettled`, each using its worker's separate absolute cwd. Both child-process intervals were `2026-10-06T02:46:40.923Z` through `2026-10-06T02:46:41.044Z`; both exit0, 3/3. Raw command/interval identities: [left-concurrent](left-concurrent.json), [right-concurrent](right-concurrent.json), with separate stdout logs. This proves concrete test-process overlap and is labeled main validation, not worker-authored code-writing overlap.

Before serial integration, both worker trees were clean. Their commit-parent chains independently reached fixed base; each final diff contained exactly its module, test and3 evidence files. No shared state or other worker write-set modification was present.

Serial integration:

1. Left implementation `da5c25acbbbec37c21bc2cc52d2ebba5d505cfd1`, evidence head `305af3931823374c32ec3e636111736cd8addb8a`; merged by main as `4e6ebf7c8058ab846959a0813bf6dc5bd2d2a4ed`. Root integration target3/3, exit0, then01 resolved.
2. Right implementation `6e5cb02b302491d123592a88e6a8623b5d8968b3`, evidence head `3430d34818035b82b79b39e8de2fabb8c402815c`; merged by main as `9b51cef8988b31438260e2894bc340e276c0bf65`. Root leaves6/6, exit0, then02 resolved.
3. Frontier released03 only. Main started from latest accepted integration `b60881bbb46f68c93fcf63c7f9023adc10fbbc1d`, preserved direct leaf consumption, true missing-pair red exit1, then [fan-in-green](fan-in-green.log)8/8, exit0; source `2d6f55a8e71bc704948ce4385664208a8bbc06e9`.

The three states are now resolved. Worker branch heads remain recoverable; clean merged checkout cleanup does not remove their commits or evidence. No additional PR/retro/review matrix was added for this supplemental mini.
