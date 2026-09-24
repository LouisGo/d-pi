---
status: accepted
---

# 随包提供 OMP，默认共享原生配置，桌面偏好单独保存

2026-09-24：用户要求参考 OpenCode 并沿用其配置策略。核对 OpenCode v1.18.32 的正常本机桌面路径后，决定本应用携带固定兼容版本的 OMP，但默认沿用 OMP 原生配置解析与存储，不为 GUI 创建另一套默认模型、Agent、认证和记忆配置。窗口布局、草稿、最近项目等 App 自有数据仍保存在桌面应用的数据目录。

这取代讨论中“默认独立配置，显式选择才共享 CLI”的建议。共享原生配置能直接复用已有 CLI 环境，并避免同一个 OMP 因入口不同出现两套设置；代价是 GUI 保存全局设置也会影响使用同配置根的 CLI，界面必须明确作用域与生效时点。没有安装 CLI 的用户同样可以通过随包 Runtime 使用原生配置目录，配置共享不代表依赖外部可执行文件。

## 接入约束

- OMP 执行文件来自应用受管理资源；配置目录由 OMP 原生规则确定，保留环境/profile/显式目录等原生选项，不硬编码只认 `~/.omp/agent`。Host 的 RPC 进程与配置 CLI 必须使用一致的配置上下文和项目 cwd。
- Settings 经原生接口读写；不复制凭据，不自行实现配置合并/优先级。GUI 区分全局、项目和会话作用域，不把持久默认值展示为当前运行实例的实际值。
- 共享配置不等于共享运行进程，也不授权 GUI/CLI 同时写入同一个原生会话。继续沿用 ADR-0001 的 utility SessionHost 与独立 OMP 进程设计。
- App 的布局、草稿、连接元数据等与 OMP Runtime 数据分离。测试继续使用临时隔离配置，避免修改用户原生环境。
- 内置 OMP 固定版本与外部 CLI 可能不同；采用共享配置不构成任意版本可互写的兼容保证，不自动升级外部 CLI 或迁移未知格式。

## OpenCode 依据与范围

调查日期 2026-09-24；GitHub latest 稳定发布为 [v1.18.32](https://github.com/anomalyco/opencode/releases/tag/v1.18.32)，源码 commit `545f51d26cc39a907d2867492d498d9607ea5fa4`。本结论来自官方源码/文档，没有安装或运行 OpenCode。

- [桌面 server.ts](https://github.com/anomalyco/opencode/blob/v1.18.32/packages/desktop/src/main/server.ts)：通过 utilityProcess 启动包内 sidecar，继承环境；普通路径没有另设 XDG_CONFIG_HOME，仅为未设定的 XDG_STATE_HOME 提供 App 路径。
- [sidecar.ts](https://github.com/anomalyco/opencode/blob/v1.18.32/packages/desktop/src/main/sidecar.ts)：加载内置 server，未把 Runtime config 重定向到桌面 userData。
- [原生全局路径](https://github.com/anomalyco/opencode/blob/v1.18.32/packages/core/src/global.ts)、[配置实现](https://github.com/anomalyco/opencode/blob/v1.18.32/packages/opencode/src/config/config.ts)：Runtime 沿用原生配置路径与配置层；通常为 `~/.config/opencode`，支持环境指定。
- [官方配置文档](https://opencode.ai/docs/config/)：全局 Runtime 配置与项目配置按原生规则合并，TUI 设置另有文件。
- [桌面 store.ts](https://github.com/anomalyco/opencode/blob/v1.18.32/packages/desktop/src/main/store.ts)：桌面 store 位于 Electron userData。**不能据此推断 OpenCode 的全部状态目录都与 CLI 完全相同。**

只沿用“Runtime 原生配置共享、客户端偏好分离”的产品策略；不复制 OpenCode 的 HTTP Server、文件格式或全部服务架构。当前源码的外部 OMP 发现尚待改为随包资源，本 ADR 记录目标，不宣称打包已实现。
