# 独立审查与修复

2026-10-01。所有 reviewer 均只读；主 Agent 核实、实现和验证，不按未证实风险凑数。最后源码的完整 `pnpm check` 通过（475 行为测试、33 架构、47 tooling；固定 CLI 原生 smoke 单项显式 opt-in 跳过）。

| 审查 | 有价值的问题及处理 | 证据 |
| --- | --- | --- |
| review_model_transition | 同 Thread 快路径绕过关闭预约；恢复同一身份时模型指针变化误报选择成功。已按关闭/业务身份修复 | AppModel 导航行为反例先失败、修复后通过 |
| review_router_types | Biome 格式化使三个 TS 反例的 expect-error 与属性诊断分离。已把指令落到非法属性 | 六环境 typecheck 及真实导航编译正反例通过；tooling 47/47、相关 React/Router 18/18 |
| review_router_boundary | history 并发拒绝触发 load 提前 resolve；SDK 同 href 快捷路径绕过 history；新并发保护会丢新建 Thread 的定位。均已修复 | 实际 Router + AppModel 的 deferred Main 回包及路由 load 延迟复现，修复前失败；最终 Router 5/history 1/model 5 共 11/11 独立复核通过 |
| review_router_final | 原生页签验证只证明 DOM 保留，未证明目标页面已切换；已逐页签等待 hidden 与 aria-pressed 状态。其余未发现新增已证实阻塞 | 复核所有生产 navigate/注册推导、作用域/生成、资源挂载及 native 验证脚本；最新事务修复由 boundary reviewer 再独立核对 |

实施检查不替代真实打包验证或用户认可；对应构建与运行结果记录在交接。

最终交付 audit（review_router_final）通过：独立核实完整日志、干净副本六环境生成及构建/打包、11 项原生结果/2 次隔离调用、源包和交付副本相同 Asar SHA、生产源码未变化、工程/试用/认可分开，无实质缺口或虚报。

## 两次提交复核与 Renderer 整理

2026-10-01，按用户新要求复核 `29dc7ab..1bf146b`。主 Agent 与独立只读 reviewer 都沿实际 Router → AppModel → Main 路径核实导航准入、同位置 shortcut、POP、并发、选择回包丢失、unknown 核对、关闭预约、IME 和资源身份，未发现新增的高价值行为缺陷；原源码的 router/history/model-navigation 11 项回归通过。

组织问题有明确依据：原根目录混放应用资源装配、外壳、三种阅读面板、模型/执行控件和编辑器装饰；`app-layout.tsx` 同时组合外壳、项目列表、Thread 工作台与空状态，`conversation.tsx` 同时组合实时阅读、原生历史和提交收据。此次参照 Main 的职责目录和模块的就近测试形式，落实 `wiring / shell / reading / workbench / components` 分工，保留 `routes / routing / styles`。共享 Markdown 与 URL/收据呈现仍各有单一实现，未加 barrel 或新领域模块。入口规则见 [`src/app/AGENTS.md`](../../src/app/AGENTS.md)。

最终验证（Node 24.21.0 / pnpm 12.8.1）：Renderer 18 文件 / 80 项行为回归通过；完整 `pnpm check` 通过（475 行为、33 架构、47 tooling；既有 CLI 原生 smoke 显式 opt-in 跳过 1 项），`pnpm build` 通过。结构报告显示 247/247 源码归属、`unowned=0`、例外 0、边界错误 0，生成路由树字节未变化。首次完整门禁在旧文档链接处失败，更新源码目标后完整重跑通过；历史命令、哈希与冻结记录未改写。

最终独立 review 核实实际新文件及相对 import，无实质回归；50 个生产函数/类中 49 个 body 完全一致，唯一差异为 `ApplicationLayout` 移除未使用的 editor 透传，实际工作台继续从 Context 取得适配。独立运行订阅边界、编辑连续性和 Router 三文件 / 20 项回归通过。构建保留既有 Router CLI 循环依赖和大 chunk 警告。本轮尚未打包或重做原生 GUI 试用，原交接的本地候选及其原生证据不作为当前源码的新构建证据。修改留在本地工作区，未提交或推送，既有 `bun.lock` 保留。
