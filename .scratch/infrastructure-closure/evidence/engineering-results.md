# 工程入口验证

2026-09-30。本次检查作用于基建收口的当前工作树，未提交实现不冒称已由某个 HEAD 固定；最终分批 SHA 由收口规格登记。本记录没有远端 CI 执行或用户试用证据。

## Runner 与资源

命令均通过 `PATH=/private/tmp/d-pi-rewrite-toolchain/node-v24.21.0-darwin-arm64/bin:$PATH` 选择现有目标 Node，不改变用户默认 Node 或全局 Git 配置。`pnpm check:environment` 的实际输出：

```text
Development Node: 24.21.0 (target 24.21.0)
pnpm: 10.5.2 (target 10.5.2)
Platform: darwin-arm64
Installed exact dependencies: 42/42
OMP host Bun: 1.3.14 (target 1.3.14)
Electron process: 44.4.5; embedded Node: 24.21.0
SDK manifest: OMP 18.3.0, Bun 1.3.14, darwin-arm64
PASS: development environment (0 issues)
```

## 固定 SDK 直接行为

执行一次 `env -u D_PI_NATIVE_EVIDENCE SDK_ROOT=/Users/lou/Learn/d-pi/resources/sdk PATH=/private/tmp/d-pi-rewrite-toolchain/node-v24.21.0-darwin-arm64/bin:$PATH pnpm validate:sdk`，顺序复用 `validation/s3/sdk-control.mjs` 和 `sdk-failure.mjs`。使用固定 SDK/Bun 与隔离 localhost provider；没有设置证据输出路径，没有覆盖已有录制样本。

```text
Native idle observation {
  paused: false,
  stopping: false,
  pendingAsync: false,
  admitted: false,
  streaming: false,
  compacting: false,
  queued: 0,
  background: 0,
  queue: []
}
PASS: official SDK stop retains native queue; explicit continue consumes the same session exactly once
PASS: unchanged SDK accepts prompt, then reports an asynchronous failure with the same request ID; provider calls: 0
```

退出码 `0`。这是 SDK 的实际行为证据；标准集成测试中的已有帧回放只证明 App 消费录制帧。`D_PI_NATIVE_SMOKE=1` 控制的是另一条固定 CLI artifact 两轮原生流测试，本轮 CI 不启用它，也不把它称作 SDK 检查。

## 门禁红绿与现有回归

- 架构新增负例先出现 4 个失败：目录/散文可被登记为公开入口、Renderer 能导入 Electron 子路径、生产代码能导入测试工具/目录、坏 manifest 被错归类为规则退出码。最小实现后架构文件 `16/16`，完整 `pnpm test:architecture` 为 `32/32`，退出码 `0`。
- 依赖负例先出现 6 类失败：删除已确认基础依赖、错放声明 section、非精确版本/Zod v3、陈旧或多余 root lock importer、同族版本不一致、未知锁格式。接入现有 `check:tools` 后依赖与原环境测试 `10/10`；当前真实 checkout `check:tools` 通过。库职责仍由现有行为测试证明，不由安装存在推断。
- 设计门禁新增退出码/缺配置负例先 `3/3` 失败；修复后门禁文件 `6/6`。真实规则错误仍非零；缺工具、崩溃和缺配置是退出码 `2`，不会伪装成没有违规。
- hook 初次 `7/7` 因缺少实现失败；实现后真实临时 Git 仓库验证 commit 拒绝、原 hook 先执行与拒绝、全局配置和原文件保留、重复安装、卸载还原、后来配置变更保护、旧 linked checkout 和缺 pnpm。另两个真实缺口先红后绿：损坏安装记录不能清空原配置；尾随空白路径不能丢失原 hook。最终 hook 文件 `11/11`，退出码 `0`。
- `pnpm test:tooling` 完整运行 `38/38`，随后新增尾随空白路径负例并复测 hook 文件 `11/11`。后续完整检查应包含新增的第 39 项，由最终规格记录，不将本次 38 项说成最终全量结果。
- `git diff --check` 与 13 个本子任务 JS/package 文件 Biome 检查通过。CI YAML 经 Ruby YAML 解析；工程入口契约测试 `2/2` 通过，SDK/CLI 路线纠正负例也先红后绿。

## Hook 与 CI 边界

仓库 [pre-commit](../../../.githooks/pre-commit) 只执行 `check:fast`；[显式安装器](../../../scripts/git-hooks.mjs) 保存原配置，原 hook 文件保持原位，通过 Git 元数据 dispatcher 转发。全局配置不变；未启用 worktree 配置时快速门禁仅作用于显式安装的 checkout，其他 linked checkout 继续原 hooks。当前 checkout 安装和真正 hook 调用将在主 Agent 冻结、报告新鲜度与快检绿色后验证，尚不能据本记录宣称已启用。

[CI 配置](../../../.github/workflows/check.yml) 限定 `macos-14` 且断言 `darwin-arm64`，复用冻结安装、Electron/SDK 资源准备、环境、`validate:sdk`、`check` 和 `build`。GitHub 官方 [runner 文档](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)于本次核实为 macOS arm64；三个 Action 标签通过官方仓库 `git ls-remote` 与 action metadata 核实并固定为完整 commit SHA。未验证或声明 Linux/Windows 原生支持；没有 push，远端 CI 未执行。
