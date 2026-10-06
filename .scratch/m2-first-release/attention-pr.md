## Summary

接入多 Thread 的应用内待答/失败提醒、完成/未读状态、显式通知偏好和真实目标导航。提醒不抢焦点，多条提醒独立滚动并保留阅读与 Composer；Main观察不依赖窗口，不改变OMP执行、回答或提交事实。

本PR当前base为main `7031b96`，基础诊断和retro已先push进入main。整合保留提醒分支产品与候选、最后的真实Luna生成记录，以及main最新有界wait/CDP取消和证据交接；不重复交付诊断或创建第二个PR。当前产品源码与 `3c4c106` 相同，无新产品构建。所属[spec](https://github.com/LouisGo/d-pi/blob/codex/m2-thread-attention/.scratch/m2-first-release/spec.md)，[整合记录](https://github.com/LouisGo/d-pi/blob/codex/m2-thread-attention/.scratch/m2-first-release/pr4-integration.md)。用户最新授权检查后合并，01c和M2认可仍独立开放。

## Evidence

- 历史TDD与独立双轴评审保留：[提醒](https://github.com/LouisGo/d-pi/blob/codex/m2-thread-attention/.scratch/m2-first-release/attention-review.md)、[retro](https://github.com/LouisGo/d-pi/blob/codex/m2-thread-attention/.scratch/ai-workflow-v13/m2-retro-review.md)。主流程真实Main/SQLite与React修复包括pending导航期间错误清未读，原问题经独立复核关闭。
- 本轮整合的完整 `pnpm check` 通过，798行为/34架构/89工具及类型/设计/i18n/文档/状态门禁，2项既有opt-in跳过；首次自动合并import顺序门禁失败保留，局部排序后完整重跑。build及整合harness的17项实际包内检查通过；Spec/Standards独立整段复核均无高价值发现，分别独立79/118应用及各15工具回归通过；精确范围与证据在[整合记录](https://github.com/LouisGo/d-pi/blob/codex/m2-thread-attention/.scratch/m2-first-release/pr4-integration.md)按最终结果更新，远端CI须对当前head核实。
- 既有clean候选 `0.1.0-m2.20 / 3c4c1060-8b550d60`，17项固定SDK+localhost/macOS验证及ZIP/asar身份：[交接](https://github.com/LouisGo/d-pi/blob/codex/m2-thread-attention/.scratch/m2-first-release/attention.md)。此次复用原ZIP核验，不重打包，不重复原生inspect；m2.19真实关窗/Finder同Main重开及systemfailed的18项记录仍为对应旧source历史。
- [首次真实Luna闭环](https://github.com/LouisGo/d-pi/blob/codex/m2-thread-attention/.scratch/m2-first-release/real-provider-e2e.md)：既有OpenAI认证、新独立Thread、真实回答/GUI/收据/原生历史一致。本轮仅整合已保存证据，不发新账户请求；未覆盖新认证、工具、附件、多供应商或完整自开发闭环。
- 系统通知实际显示/点击仍未观察，m2.19真实failed、根因unknown，m2.20未重复OS检查，App回退可用。01c保持claimed，PDF视觉/OCR、完整B6/系统IME/其余真实账户组合与用户认可待验。合并工程源码不关闭这些验收项。

## Merge Danger

SQLite schema11通知偏好是持久化one-way：源码revert不降数据库，旧候选拒绝新schema。回退保留当前数据库、附件及新增工作，用升级前before-v11备份在独立数据根验证，不覆盖当前数据或删库。影响链为Main Runtime/收据→提醒投影→trusted IPC/preload→GUI导航/通用通知与窗口入口，默认系统/完成通知关闭；不新建OMP队列、不自动重试unknown，冷旧Thread只读。

本轮整合工具/文档为可逆修改，main回流不会改变现有候选身份或发出模型请求。按最新授权在最终head检查/CI通过后合并到main；不签名、公证、公开发布或扩大真实账户授权。
