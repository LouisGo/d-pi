# 01 Left tag
Status: resolved
Blocked by: none
Export leftTag(id) from .scratch/parallel-mini/src/left.mjs; return `L(${id})`. Own tests/left.test.mjs and evidence/left-* only. Verify 02a suffix and whitespace preserved; no normalization required. Do not write management state.

## Comments
2026-10-06：worker `/root/forward_test/mini_left` 工作提交 `da5c25acbbbec37c21bc2cc52d2ebba5d505cfd1`，证据 head `305af3931823374c32ec3e636111736cd8addb8a`，确从 fixed base 启动，仅5个允许文件。真实 red exit1 / green exit0，3/3。主 Agent 单独合入为 `4e6ebf7c8058ab846959a0813bf6dc5bd2d2a4ed`，集成目标测试3/3、exit0，见 [left-integrated](../evidence/left-integrated.log)。
