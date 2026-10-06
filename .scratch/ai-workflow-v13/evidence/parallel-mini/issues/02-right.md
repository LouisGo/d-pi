# 02 Right tag
Status: resolved
Blocked by: none
Export rightTag(id) from .scratch/parallel-mini/src/right.mjs; return `R(${id})`. Own tests/right.test.mjs and evidence/right-* only. Verify 02a suffix and whitespace preserved; no normalization required. Do not write management state.

## Comments
2026-10-06：worker `/root/forward_test/mini_right` 工作提交 `6e5cb02b302491d123592a88e6a8623b5d8968b3`，证据 head `3430d34818035b82b79b39e8de2fabb8c402815c`，从 fixed base 启动，仅5个允许文件。真实 red exit1 / green exit0，3/3。主 Agent 在01验收后单独合入为 `9b51cef8988b31438260e2894bc340e276c0bf65`，两叶集成测试6/6、exit0，见 [leaves-integrated](../evidence/leaves-integrated.log)。
