# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.

## Feature slices (D-28–D-30)

按[无头功能合同](../architecture/headless-features.md)拆分最近要交付的功能：验证票提供证据，无头功能票提供可执行逻辑及测试，GUI 票消费已验证合同并验收交互。小功能可在一票中依次完成；大功能按独立可验收行为拆分。不要把“纵向切片”解释为每张票都必须写正式 UI，也不要按全产品的 store/hooks/pages 横向分批。

任务记录所处阶段（G1/M1/M2/M3）、受影响决定、行为目标、真实阻塞依赖、关键状态/资源拥有者及释放条件、验收证据；沿用现有 status 约定，不另建状态体系。多个可分别交付的目标通常要拆开；只创建字段或按钮、无法独立验证价值的任务通常应合并。

to-tickets 可在当前范围与必要接口证据明确后用于形成任务；若该 skill 不可用，按本地约定手工拆分即可，不自动安装全局 skill。先细化最近的 G1/M1，后续功能保持较粗；生成票不授权开始实现，无头验收不代替 M1/M2 的 GUI 验收。
