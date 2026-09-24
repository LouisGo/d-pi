# OMP Runtime → Electron GUI：能力复用可行性

日期：2026-09-24。当前工作入口；优先级来自用户本轮指令。先确认 Runtime 能力及接入成本，再投入 GUI 产品化。旧阶段 1 的全部验收、视觉打磨和前端状态管理不是本轮门槛。

> 后续澄清与补测：用户需要配置 Agent 类型的模型/思考默认值，暂不要求直接控制运行实例。[子 Agent 配置与 Settings 验证](settings-feasibility.md)新增 6 项检查通过；原生配置写入可影响同一主会话的下一次 spawn。下文的定向控制缺口保留为事实，但不再作为当前需求的可行性门槛。

> 本阶段收束：[最小 Electron 随包验证](packaged-runtime-evidence.md)已通过，应用包内 OMP 完成跨进程往返和模型回合，退出检查通过。以下“完整应用包尚未测”指正式产品构建/发行验收；最小随包方案已得到实测支持。进入后续需求讨论，不提前做 UI 或前端基建。

## 结论

**有条件可行，值得继续做薄接入；尚不能宣称 GUI 已完整覆盖 OMP TUI。**

真实 OMP 18.3.0 的轻量实验已证明：多个独立会话可并行；子 Agent 可执行、输出事件与历史，并在创建时使用不同思考档位；原生本地记忆可以跨同项目会话注入；模型/思考设置、配置 CLI 和供应商请求并发上限可复用。宿主工具可将客户端能力接入 OMP，也可用于实现独立会话间的显式消息路由。

主要接口缺口：RPC 没有与 TUI 对等的、指定子 Agent 的通用启动/停止/恢复/动态模型与思考档位控制命令。现有观察接口不等于完整管理接口。GUI 的精确操作不能依赖让主模型“帮忙点按钮”；若这些是硬要求，需要一个小的 OMP 扩展/适配方案验证，再决定是否接受其维护成本。未证明必须 fork OMP，也未证明任何扩展方案已经可用。

## 证据边界与复现

- [本轮范围](../../.scratch/omp-runtime-feasibility/spec.md)、[可执行探针](../../.scratch/omp-runtime-feasibility/probe.cjs)、[机器结果](../../.scratch/omp-runtime-feasibility/result.json)。最终 9 项检查通过；其中斜杠命令检查验证的是接口边界，并非所有命令都可用。
- 上游固定为 `v18.3.0`，源码 commit `62bc57be1b03ef0802a33cf7f5f530e534527531`。官方 `omp-darwin-arm64` 发行文件 SHA-256 为 `d61fb411f24146bed48dd901b13b5912a297d899ee691dda69c4b5b7ab8c35dc`，已与该发布的 `SHA256SUMS.txt` 核对。[发行页](https://github.com/can1357/oh-my-pi/releases/tag/v18.3.0)
- 本轮运行于 macOS arm64，临时下载独立可执行文件，没有全局安装 OMP。子进程环境使用允许列表，`PATH=/usr/bin:/bin`；配置、项目、会话与记忆均在临时目录，不使用个人提供商凭据。
- **真实 Runtime、真实工具与本机进程；模型传输是 localhost 固定响应。**证明接口和数据通路，不证明模型理解、真实供应商兼容或产品体验。
- 旧 [Electron 原型结果](../../.scratch/omp-gui-m1/prototype/result.json)已证明 MessagePort → utility process → OMP 往返；[阶段 1 记录](stage1-evidence.md)记录可见 GUI、真实模型与本地 `.app` 开发闭环。本轮复用这些历史证据，没有重新完成 GUI 或打包验收。

复现：从发行页取对应平台的独立文件，校验同发布的哈希，再运行：

```sh
node .scratch/omp-runtime-feasibility/probe.cjs /absolute/path/to/omp /tmp/d-pi-feasibility-result.json
```

探针仅依赖 Node 内置模块，约十余秒（随机器变化），无需安装项目依赖。固定模型会驱动真实 OMP 的 task、learn 和宿主工具；临时配置不加载用户凭据或扩展。结束关闭子进程与本地服务器，临时目录保留供核对。省略结果参数会更新仓库内 `result.json`。这是实验脚本，不是生产协议解码器或完整测试框架。

## 能力矩阵

| 能力 | 证据与判断 | GUI 接入边界 |
| --- | --- | --- |
| 多会话 | **实测通过**：两个 OMP 进程同时请求本地模型，峰值并发 2，会话 ID 不同，历史不串。 | Host 管理实例和前台订阅；本轮没有实现多会话界面或复测并行故障隔离。 |
| 子 Agent 执行与观察 | **实测通过**：一次 task 创建两个真实子 Agent；活动列表为 2，收到 lifecycle/progress/event，完成后能按 ID 读取历史。 | 直接消费原生事件，不解析 TUI 屏幕。完成后的活动列表为 0，GUI 要保存结束记录；重新启动后的历史枚举完整性未测。 |
| 子 Agent 思考档位 | **实测通过创建时配置**：项目 Agent 定义与 task `effort` 生效，结果分别为 `minimal`、`xhigh`。 | `task.enableEffort=true` 才开放 `lo/med/hi`；它映射模型支持档位，不是固定等于 low/medium/high。此测试由确定性模型发出 task 调用，不证明 GUI 可直接启动任意子 Agent。 |
| 子 Agent 模型、运行中控制 | **源码确认部分配置能力，直接 GUI 控制仍有缺口**：Agent 定义支持模型选择；RPC 的模型/思考设置属于主会话，没有子 Agent 目标参数。 | 不得把主会话的 `set_thinking_level` 当成子 Agent 控制。指定子 Agent 的直接发送/停止/恢复/热切换尚未通过宿主适配验证。 |
| 跨 thread 通信 | **宿主适配实测通过**：A 调用注册的宿主工具，探针将消息送入独立进程 B 的原生 prompt，B 完成后结果返回 A。 | 路由由客户端拥有，OMP 仍执行任务并保存记录；不是 OMP 自带的独立 thread RPC。繁忙目标的队列、循环调用、取消和重试策略未测。 |
| 跨会话记忆 | **原生 local 后端实测通过**：A 经 learn 保存测试约定，新进程 C 在同项目的模型 system/developer 输入中收到；另一个项目 D 未收到。 | 复用 OMP 存储与注入，不建立第二份权威记忆。只验证显式 lesson，不验证自动提炼/合并质量、其他后端或任意跨项目记忆。 |
| 主会话模型与思考设置 | **实测通过**：A 切换到 alternate/high，B 仍为 probe/low。 | 可直接使用 RPC；未验证推理进行中热切换的生效时点。 |
| 持久设置与请求并发 | **实测通过**：原生 `config set/get --json` 设置 `providers.maxInFlightRequests={probe:1}` 后，新启动的两个进程峰值 HTTP 请求为 1。 | 同配置根下共享的请求限额。子 Agent 数上限 `task.maxConcurrency` 是另一项配置，不能混为一谈；外部写配置后运行中进程的热重载未测。 |
| 图片输入 | **传输实测通过**：RPC 图片进入本地模型请求；OMP 将本次 PNG 转成 WebP。 | 不承诺字节不变；真实视觉理解、大小边界和复杂附件策略未测。 |
| 宿主工具 | **实测通过**：注册工具 → OMP 调用 → 宿主返回结果 → OMP 继续。 | 为浏览器、文件引用等 App 能力提供扩展入口；未实现真实浏览器控制或文件组件。 |
| 独立 Runtime / 随包基础 | **独立二进制实测通过**：绝对路径运行，PATH 不含 OMP/Node/Bun，完成上述任务。 | 支持“应用携带 Runtime”的方向；不是干净机器完整验证。本轮未配置 electron-builder 资源、签名、公证或 GUI 认证。 |

## 必须保留的具体发现

### 1. TUI 控制面板不能直接搬进 RPC

`/settings` 在 `rpc-ui` 下没有打开界面，而是作为普通需求进入模型。源码中 `/settings`、`/agents`、`/hub` 仅有 `handleTui`；无 text handler 的命令会落回 prompt。**接收成功不能判定设置操作成功。**

GUI 设置页应使用已存在的结构化 RPC 和 `omp config ... --json`，对尚无接口的行为单独适配。子 Agent 面板可由事件、progress 和 transcript 构建，但本轮零费用 fixture 不证明真实用量指标准确，也未核对控制面板的所有字段。

### 2. “看见子 Agent”和“直接控制子 Agent”是两个门槛

`set_subagent_subscription`、`get_subagents`、`get_subagent_messages` 已实测；标准 `RpcCommand` 没有 `subagentId` 定向的控制系列。TUI 内部有更多生命周期能力，`agent://` 写入还存在原生 peer messaging，但依赖注册表、工具上下文与 IRC 开关，不能当作跨独立进程的通用 GUI RPC。

当前能够承诺：展示真实执行、读取历史、按创建配置运行。不能承诺：GUI 随时指定任意子 Agent 改模型/思考、单独停止或恢复。也不要把整个 OMP 的 `abort` 冒充单个子 Agent 的停止。

### 3. 记忆可复用，但默认和作用域必须明确

本轮显式开启 `memory.backend=local`、`autolearn.enabled=true`。记忆来自 OMP 原生 learn，未通过手工伪造记忆文件制造成功。新会话收到了 lesson，但原 A 会话的 `/memory view` 仍返回空 payload；与“不改写当前 prompt 前缀、后续会话注入”的行为一致。

`/memory view`、`/memory stats` 经 RPC 作为本地命令执行；local 后端的 stats 明确返回不支持。可构建记忆界面，但不能假定所有后端提供相同统计/检索能力。自动摘要管线、跨项目共享和远端后端不在本次结论内。

### 4. 随包方向成立，不等于已经随包交付

当前正式应用源码仍从外部路径寻找 OMP，`package.json` 也未将本轮二进制纳入构建资源。后续应改为受管理资源路径，配置/会话保持在可写数据目录；具体打包与首次启动再做一次小范围验证。本轮无需用户预装 OMP，但运行环境仍是开发机器，不宣称没有其他系统依赖。

## 复用的上游依据（固定版本）

- [RPC 命令类型](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/modes/rpc/rpc-types.ts)：观察接口和控制接口的准确范围。
- [RPC 分发](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/modes/rpc/rpc-mode.ts)、[斜杠命令分发](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/slash-commands/acp-builtins.ts)、[设置命令](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/slash-commands/builtin-modes.ts)：TUI-only 命令不能作为 GUI 设置 API。
- [子 Agent RPC 注册表](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/modes/rpc/rpc-subagents.ts)：终态移出活动列表，保留有限历史引用。
- [Task 文档](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/tools/task.md)、[Agent 定义](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/task-agent-discovery.md)：模型及 effort 创建配置。
- [Task 实现](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/task/index.ts)、[设置 schema](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/config/settings-schema.ts)：Agent 并发与供应商请求并发的不同作用域。
- [Agent URL 写入](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/internal-urls/agent-protocol.ts)、[Agent Hub](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/agent-hub.md)：原生 peer messaging 和 TUI 控制边界。
- [Memory 文档](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/memory.md)、[learn 实现](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/tools/learn.ts)：后端和显式 lesson 的行为。

## 下一步投入建议

不再重复基本 RPC 通路、两个会话、图片、宿主工具或 local lesson 的可行性实验。已有证据足够支持薄 GUI 接入，不需要先更换状态库或搭建完整组件体系。

后续用户已明确不把指定运行实例的直接控制作为当前要求。配置 Agent 模型与思考档位的实际目标已由 [Settings 补测](settings-feasibility.md)验证，无需为此先扩展 Runtime 控制 API。若将来出现单实例停止/恢复/热切换场景，再验证对应适配，不提前投入。

随包最小启动作为另一独立交付验证；自动记忆质量、长输出性能和完整控制面板属于后续有具体需求时再验证的范围。本轮不扩展这些工作。

## Comments

- 2026-09-24：纠正首轮探针的三个假阴性：图片被合法转码；宿主工具响应需包在 `result` 字段；子 Agent 完成后不再位于活动列表。最终结论来自修正后的重复验证，不把测试代码错误记录成 OMP 缺陷。
