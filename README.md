# OMP Desktop

当前优先级是验证 **OMP Runtime 能力能否由 Electron GUI 复用**，再投入产品化与交互打磨。多会话、子 Agent、记忆、设置及随包运行基础的最新结论见 [Runtime 可行性验证](docs/prototype/runtime-feasibility.md)。产品目标是应用携带 OMP，用户无需另行安装；下面描述的是当前仍使用外部 OMP 的单会话实现。

配置策略沿用 OpenCode 的原则：默认共享 OMP 原生配置，桌面偏好单独保存；详见 [ADR-0002](docs/adr/0002-share-native-omp-config.md)。

本轮可行性验证已收束：[最小随包 `.app` 验证通过](docs/prototype/packaged-runtime-evidence.md)。这不代表下述正式应用已经改为内置 OMP，也不代表发行验收完成；下一阶段先讨论需求与技术选型。

OMP 18.3.0 的本机桌面会话客户端。阶段 1 面向已有 OMP 配置的 macOS 用户，在一个项目中使用一个活动会话。Electron Main 管窗口和进程，utility SessionHost 使用 `rpc-ui` stdio RPC 连接 OMP，React 负责界面。

## 本地运行

```sh
pnpm install --frozen-lockfile
pnpm dev
```

在应用中选择项目目录。默认发现 `/opt/homebrew/bin/omp`、`/usr/local/bin/omp` 和 `PATH` 中的 `omp`，也可在连接界面指定可执行文件与 OMP 配置目录。当前只接受已验证的 OMP 18.3.0。

```sh
pnpm typecheck
pnpm test
pnpm pack:mac
```

本地构建产物位于 `dist/mac-arm64/OMP Desktop.app`。这是未签名的本机目录构建，尚不是发布安装包。

## 操作语义

- 空闲时发送正常需求；执行中默认排队追加，另有“干预当前执行”入口。
- “停止当前执行”请求 OMP 中止本轮，不清空 OMP 已接受的队列。真正退出应用时可选择等待、停止后退出或取消。
- 关闭窗口让任务继续运行；从 Dock 激活应用接回窗口。刷新窗口会接回同一 SessionHost 与 OMP 进程。
- OMP 或 Host 中断后，界面标出中断和结果不明的提交。用户显式恢复原生会话；客户端不会自动重发需求。

阶段 1 的实测与未完成验收见 [运行证据](docs/prototype/stage1-evidence.md)。
