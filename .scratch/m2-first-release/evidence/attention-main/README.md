# 01a Main attention TDD evidence

Worktree /Users/louistation/.codex/worktrees/m2-attention-main/d-pi, fixed base 3cbff7e3ec143598dba6a5b1d2c7fe6bc3d0bd50.
Raw runner outputs captured during actual incremental work; no regenerated red proof.

- 01/02: schema10 notification preference migration/preservation/reopen/backup, red missing repository method then green. Integration test moved from preferences/main to app/wiring/notification-preferences.test.ts after architecture rejected the test's dependency inversion.
- 03/04: absent Main coordinator red then background pending question/duplicate and late RuntimeView/answered clear green. Initial fixture used a wrong UiMessage shape and was corrected before successful execution.
- 05/06: ACK != completion; older submission completion cannot override newer dispatch, red then green.
- 07: existing context/unread/click correlation/failure/512 boundaries supplementary green, no fabricated red.
- 08/09: native failed event released listeners red then green.
- 10/11: absent trusted IPC red then source-before-parse and reload-before-commit green.
- 12/13: coalescing real receipt/runtime failure with same trace and unsupported native support startup fallback red then green.
- 14: existing IPC unknown-thread/extra payload/storage failure/native click+close boundary supplemental green.
- 15/16 and 21/22: synchronous and asynchronous native failure logs original metadata trace and cannot break business result, red then green.
- 17/18: reload preferences after storage retry, red then green.
- 19/20: native close throws but listener release remains idempotent, red then green.
- 24/25: two submissions with same createdAt millisecond, red then green; unseen terminal ambiguity explicitly coverageGap.
- 28/29: already queued native click after question answered/expired navigates current Thread without resurrecting question, red then green.
- 30-final-targets.txt: 23 tests including 3 existing startup tests passed.
- types-final.txt: all seven strict type checks passed.
- architecture.txt: actual dependency inversion failure; architecture-final.txt: 342 sources pass.

Schema11 migration deliberately happens after existing submission recovery, then atomic before-v11 backup preserving schema10, then two independent integer boolean columns. Old field save/locale setters cannot overwrite notifications. Existing version-10 assertion updates remain integration owner scope.

Main owns only ephemeral bounded attention projections (512 entries/cursors); no persistent event ledger, no OMP scheduling/retry, no business text. Receipt IDs, generation, createdAt and first observed sequencing separate ACK from terminal outcome; RuntimeView.revision is authoritative monotonic input. Missing/evicted observation is an explicit coverageGap. Entries are one current aggregate per Thread.

Native adapter tests are deterministic unit boundary proof. They do not claim macOS permission, visible delivery, or click evidence. Notification.isSupported only maps capability to available; native show throw/failed maps failed and leaves App unread. Real macOS verification remains root-owned.
