# 本地 Markdown 任务约定

需求与任务记录放在 `.scratch/<feature-slug>/`，不是外部服务。提到“发布到 issue tracker”时，在该目录创建或更新相应文件；“获取任务”就是读取给定路径或编号，不要求联网或安装工具。

## 文件与状态

- 需求与设计：`spec.md`。只需要一份审查或调查成果时可直接记录其中，不强制生成任务票。
- 需要拆分实现任务时：`issues/<NN>-<slug>.md`，从 `01` 编号，一票一文件，不合并为一个总票文件。
- 任务使用 `Status: open` / `claimed` / `resolved`；需要接手时先标记 `claimed`，完成后记录实际结果与验证，再标记 `resolved`。需求文档的设计状态不能冒称实现完成。
- 真正阻塞依赖写为 `Blocked by: NN, NN`；列出的任务均为 `resolved` 后才解除阻塞。不把所有候选调查串成全局前置。
- 讨论与补充按时间追加在 `## Comments` 下，保留决定变更的理由。

## 功能拆分（D-28–D-30）

按[无头功能合同](../architecture/headless-features.md)拆最近要交付的功能：验证票提供证据，无头功能票提供可执行逻辑及测试，GUI 票消费已验证合同并验收交互。小功能可在一票内依次完成；大功能按独立可验收行为拆分，不按全产品 store/hooks/pages 横向排工，也不要求每张无头票画界面。

任务记录所处阶段（G1/M1/M2/M3）、受影响决定、行为目标、真正阻塞依赖、关键状态/资源拥有者及释放条件、验收证据。多个可分别交付的目标通常应拆开；只创建一个字段或按钮、无法独立验证价值的任务通常应合并。已有任务说明足够时，不另造重复规格。

先细化最近的 G1/M1，后续能力保持较粗。生成任务不授权开始实现；一次已授权的完整功能实现包含其必要验证、修复和 GUI 接入，无需每一层再次确认；无头验收不代替 M1/M2 的 GUI 验收。

## 可选的 Wayfinder / to-tickets

仅在用户要求或当前任务已采用对应流程时使用；skill 不可用时按上述约定手工完成，不安装为本仓库的前置依赖。

Wayfinder 可用 `.scratch/<effort>/map.md` 汇总 Notes / Decisions-so-far / Fog；每个问题仍放在 `issues/NN-<slug>.md`。`Type:` 可为 `research` / `prototype` / `grilling` / `task`，状态沿用上表。Frontier 是编号最小的未阻塞 `open` 票；领取后标 `claimed`。解决后在票中追加 `## Answer` 并标 `resolved`，再把摘要和链接写入 map 的 Decisions-so-far。只有实际需要这种导航时才维护 map。
