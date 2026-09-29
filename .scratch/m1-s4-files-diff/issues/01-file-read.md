Status: resolved

# 安全只读文件与版本合同

M1。D-06/D-25/D-29。Main 负责目录身份、真实路径和文件句柄复核，返回有界树及带版本的完整文本或明确失败。读取不执行项目代码。测试越界 symlink、缺失、空/二进制/过大、读取竞态。完成后记录验证。

## Answer

`src/main/project-files.ts` 与独立 IPC 合同已接入。`project-files.test.ts` 覆盖授权目录、越界 symlink、空/缺失/二进制/超限和读取中变化；`pnpm check` 已通过。真实 GUI 作为 02/05 的验收继续。
