# 06e reader evidence

Branch codex/m2-diagnostics-reader; worker base 4cf37b9. Only reader.ts, reader.test.ts, public.ts are product changes. shared/diagnostics.ts is the parent-owned DTO copied here for compilation and excluded from worker commit.

## TDD red/green pairs

01: public persisted snapshot + correlation and receipt ACK/outcome two facts (red undefined reader -> green).
02: field whitelist, arbitrary string code/operation/request and build metadata redaction (red dropped whole record -> green unknown values + redacted count).
03: latest retained match/record limit across rotated files (red excess records -> green sorted limit + truncated).
04: malformed/oversized/incomplete records and valid adjacent records (red JSON parse rejects -> green bounded reverse line parser).
05: scan bytes/file count and recent-tail sampling (red exceeded files and bytes -> green 12-file/8MiB bound).
06: symlink/non-file/missing directory availability (red rejected symlink open -> green unreadable counters + resource finally).
07: unsupported stage values preserve conservative unknown evidence (red discarded record -> green unknown + redacted).

Each pair is preserved in NN-red.log and NN-green.log. Supplementary coverage added after corresponding behaviors: directory/line-budget/no-match, exact operation/time boundaries, mandatory UUID validation and real Writer parallel persistence/drain. Supplementary coverage is not claimed as a fabricated development red. Processing voluntarily yields every 128 processed lines; no Writer flush/acquisition.

## Final local checks

Frozen pnpm install succeeded with isolated node_modules, Node 24.21.0 and pnpm 12.8.1. final-tests.log: 10 reader tests + 2 existing Writer tests passed. types.log: main TypeScript passed. architecture.log: 326 source files boundary check passed. Biome scoped 3 files passed.

benchmark.log/json: one actual macOS near-budget synthetic file, 8,388,608 scanned bytes in 248.21 ms; RSS delta 8,814,592, heap-used delta 146,368, external delta 63,103 bytes. lsof for the test PID found 0 retained descriptors to fixture directory after the public call. This is a single local sample, not B6 complete A/B or steady-state proof. No personal log files were read.

## Coverage semantics and limitations

Directory enumeration max 256 entries; retained newest-numbered candidates max 12, active main first; 8MiB total scan bytes, max 64KiB line, 20k processed lines, cooperative processing/I/O-between-operations deadline 1500ms. Returned records are sorted descending by parsed wall-clock time within sampled evidence, max 500/filter.limit. Enumeration/scan/output budget and incomplete or oversized lines mark truncated. malformed counts bad/oversized/incomplete/shape-invalid records. redacted counts records transformed by field/value whitelist. unreadable counts directory/file read or unsafe-link/non-file failure, without source paths/error messages.

Filesystem operations are async but OS-stalled I/O itself cannot be forcibly aborted by this cooperative deadline. A sampled open descriptor stays on its inode if renamed; appended bytes after sampled stat size are excluded. Logs/clock order is evidence, not strict distributed ordering. No matches never proves an event did not happen. Writer dropped/degraded is an independent sample of true current Writer state; pending queue content is not flushed or guaranteed by export. Unknown code/operation/stage values never copied verbatim; strings use strict known values or UUID/build grammars. ACK receiptState and outcome remain independent, no inference/replay.
