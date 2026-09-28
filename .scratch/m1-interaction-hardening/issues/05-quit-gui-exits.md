# 05 超时默认作答与队列上限（已对齐，拆分为 05a/05b/05c）

Status: resolved

本票为索引，实施见 05a（主机默认作答）、05b（队列上限 20）、05c（默认标识与追发）。用户追答与原生约束见决定登记；quit 非空队列放弃仍仅记录（07 票）。验证：`pnpm check` 142 passed/1 skipped，`pnpm build` 通过（仅既有大 chunk 提示）。
