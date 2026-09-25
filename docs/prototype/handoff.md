# 当前交接：保留历史依据，按新需求渐进交付

当前先读：[决定登记](../decisions.md)与[三项基础方案](../../.scratch/product-requirements/foundation-plan.md)。阶段范围已根据七项答复收敛，详见[基础契约](../architecture/foundation-contracts.md)。设计可进入 G1，当前未启动产品或原型实现。
清理提交 `a56ea59` 移除了应用实现，也误删了仍有用的选型与原型记录。此次先完整归档被删文件，包括源码、测试和构建配置；用户已选择保留完整旧基线、逐项复用，不恢复为根目录可运行应用。没有运行旧原型。用户本意是整理优化，不是清空已有研究。

## 阅读顺序与事实来源

1. [当前产品需求](../../.scratch/product-requirements/spec.md)：最终目标、已回答的产品问题与首阶段方向。
2. [架构与交付](v1-architecture-draft.md)：延续的契约与明确的取代关系。
3. [前端库雷达](frontend-library-radar.md)：已有选择、候选理由与采用条件；[增量技术评估](../../.scratch/product-requirements/technical-evaluation.md)负责这轮新增比较。
4. [原始记录与清单](../archive/pre-reset/README.md)：49 份逐字归档，保留来源提交与文件哈希。

## 已做过的工作，不重新当成未知项

| 工作 | 证据 | 适用边界 |
| --- | --- | --- |
| M1 进程通路、confirm、刷新、bash 取消、正常退出与恢复 | [研究](../archive/pre-reset/.scratch/omp-gui-m1/research/findings.md)、[机器结果](../archive/pre-reset/.scratch/omp-gui-m1/prototype/result.json) | Electron 42.11.1 / OMP 18.3.0；隐藏窗口、本地固定模型，不是可见 GUI 验收 |
| rpc-ui 审批/ask、排队/干预/停止语义 | [原型与各场景 JSON](../archive/pre-reset/.scratch/omp-gui-m1/prototype/README.md)、[GUI 证据汇总](../archive/stage1-evidence.md) | 受控协议实验与真实 GUI 证据分开；停止不清队列 |
| 可见 GUI 修改文件、执行检查、提问、停止、关窗/退出、恢复及部分异常处理 | [阶段 1 实测](../archive/stage1-evidence.md) | 曾经完成真实模型与本地 .app 路径，旧实现已移除；并非旧 M1 全部验收通过 |
| 多会话、子 Agent、记忆、模型/档位、图片与宿主工具 | [Runtime 9 项](../validation/runtime-feasibility.md) | 固定模型与固定版本，不能推导出全部 GUI 控制已实现 |
| 子 Agent 默认设置、配置 schema | [Settings 6 项](../validation/settings-feasibility.md) | 原生设置复用已有证据，运行中实例复杂控制仍不是已交付功能 |
| Runtime 随 .app 启动和进程退出 | [随包验证](../validation/packaged-runtime-evidence.md) | macOS arm64；无完整 GUI、签名、公证或干净机器验收 |

## 旧基线的复用边界

以下是后续逐项迁入的依据，不表示本轮已迁入或重新验证。

| 旧基线部分 | 可复用内容 | 迁入时需要调整或验证 |
| --- | --- | --- |
| 协议解码与测试 | 分帧、解析及异常输入样本 | 对照届时随包 OMP 版本校验协议与错误处理 |
| Main、preload 与进程生命周期 | 关窗继续运行、退出协调、重连和恢复经验 | 在当前安全边界与多会话设计下验证 |
| SessionHost | 会话镜像、快照与增量同步、交互请求关联 | 单会话实现不能直接充当多会话基础；检查隔离、积压上限和过期请求 |
| Renderer 与 GUI 记录 | 已跑通的交互流程、真实模型操作证据 | 按自有组件层和 Streamdown 迁入；不沿用旧 Base UI / react-markdown 默认选择 |
| 构建配置与锁文件 | 可追溯的旧构建环境和入口组织 | 结合随包 Runtime 与 Biome 更新；旧锁文件不是当前版本选择 |

## 当前下一步

先只读代码与 Diff，后续编辑，渐进交付；OMP TUI 全集是最终覆盖目标。保留既有自有组件层和状态归属，编辑器已选定 Monaco，重点完成其集成与直接 ProseMirror Composer 验证（具体问题触发后才对照最小 Tiptap），不重新从零列一套冲突技术栈。

库候选不等于已装依赖；旧原型成功不等于新版本集成通过；旧计划里的未完成验收也不自动变成当前一轮全部必须完成的任务。变更平台范围、OMP 所有权或用户行为时才需要新的实质决策。

2026-09-25：供应商跟随 OMP，不设品牌白名单；已有可用配置直接进入，无配置用户走 GUI 原生初始化引导。Git Panel 自建业务 GUI、复用成熟 Git 实现，预留 Agent Changes / Run Changes / Review / Revert，具体语义待对应阶段明确。

2026-09-25 补充 D-21：[日志/监控](../architecture/diagnostics.md)是每层从开始具备的横切基础，轻量、结构化、可追溯、日常无感；专用日志界面后续可做，不要求先建完整观测平台。

2026-09-25 七项答复更新：D-23 首版新增认证仅 OpenAI 账户登录 / DeepSeek API key；已有其他配置仍复用。D-24–26 补齐身份、提交、附件、权限、性能和 G1/M1/M2/M3 边界，D-27 补回既有子 Agent 默认设置。审查 A1–A3 已同步，B1–B7 设计闭合，接口与性能验收按基础契约分切片执行，未实测项不可标通过。

2026-09-25 后续共识：D-28–D-30 与[无头功能合同](../architecture/headless-features.md)成为功能开发入口；按功能验证→无头功能→正式 GUI，不引入 XState，业务生命周期独立于 React。后续任务按 [仓库 skill](../../.agents/skills/d-pi-headless-features/SKILL.md)执行，不先做整套 UI 或把所有功能放进 hooks。
