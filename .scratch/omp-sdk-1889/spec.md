# OMP 18.8.9 隔离升级

2026-10-11。用户授权：先核实升级收益与兼容性，随后完成 18.8.9 升级、review、commit；另一会话正在处理附件输入/展示，不得干扰。

基点 `1e73213ea81966e1979c58cad1b0342f34487381`；分支 `codex/omp-sdk-1889`，独立 worktree `/Users/louistation/.codex/worktrees/omp-sdk-1889/d-pi`。所有安装、资源准备、构建、运行及提交均在这里进行。初次提交 `c24c2e8` 未复制或修改原 checkout 的未提交附件改动，也未 push/merge/发起实际供应商请求。下方本地 PR 记录为后续新增授权与组合结果。

## 判断与上游依据

建议从 18.8.7 直接固定到 18.8.9，Bun 仍为 1.3.14。它是有实际可达收益的小范围维护升级，收益主要来自 18.8.8；不需要因此增加 App 执行/历史层或开放新的产品能力。沿用 D-02/D-21/D-22/D-23/D-24，官方 SDK、原生 SessionManager 与薄 Host 的所有权不变。

- [正式 18.8.9 release](https://github.com/can1357/oh-my-pi/releases/tag/v18.8.9)：tag `fa5ff4a3a977a28b93d025f4cf50f046e019f18c`；发布于 2026-10-11 01:15:16 UTC+8，非 draft/prerelease。官方发布及 tag CI 已核实；上游 CI 不代替 d-pi 验收。
- [#15099](https://github.com/can1357/oh-my-pi/pull/15099)：Responses/Codex 空参数终止事件不再覆盖已经收齐的流式参数。兼容网关同样经过此 provider 路径，直接影响真实工具执行。实际随包 SDK 验证见 [providers.json](evidence/providers.json) 和 [responses-session.json](evidence/responses-session.json)。完整 `.done` 与 `output_item.done` 出现相互矛盾的非空参数时，两种 adapter 的优先级仍不同；这不是本次要修的空事件场景。
- [#15148](https://github.com/can1357/oh-my-pi/pull/15148)：通用 OpenAI Responses 冷恢复第一次请求保留原生历史中的加密推理；连接绑定历史的供应商仍按自身策略重建。d-pi 的 SessionManager.open → createAgentSession 路径可达。Codex 此项不变；当前实际 provider 决定用户能否受益。测试证明 opaque payload 随原生 JSONL 保存并在同 file/ID 首请求重放，不证明真实供应商对该密文的接受或费用。
- 18.8.9 相对 18.8.8 的主要新增是 TUI multiplexer/终端打开和 fork 体验；d-pi 当前 RPC driver 不接入 `openTerminal`，也不使用被移除的终端探测导出。18.8.8 → 18.8.9 的 sdk.ts、RPC driver、Responses/Codex adapter、压缩阈值/窗口实现均逐文件核实相同。
- 原生 fork 的未完成工具结果改为 unknown，避免把仍可能运行的父工具冒称 aborted。当前 d-pi 私有恢复使用 create/open，未新增 fork 产品入口；仍用真实 SessionManager 验证 fork 修复不改父文件。判断 YAML 的空白/空集合序列化也有变化，可能改变相关 prompt/cache 字节，未测量缓存收益。

## 压缩与配置

先用固定官方 Settings.loadReadOnly 核对默认 profile 和当时检查的项目有效配置：`compaction.modelThresholds={}`、`modelThresholdsEnabled=true`、`thresholdTokens=-1`、`thresholdPercent=-1`、未指定 reserve、`extendedContext=false`。当前没有需要转换的模型数字覆盖，默认触发点在检查的标准窗口下保持一致。未修改共享原生配置；此结论不代表其他 profile、未注册项目或随后修改的配置。

18.8.8/18.8.9 数字模型覆盖是按策略缩放的基准窗口；保持精确触发用新字符串 `fN`。固定计数达到/超过实际窗口时改按窗口减 reserve 回退。实际 SDK 的例子：

| 1M 窗口配置 | 18.8.9 触发点 |
| --- | --- |
| 默认、无模型覆盖 | 850,000 |
| 模型覆盖 `400000` | 340,000 |
| 模型覆盖 `f400000` | 400,000 |
| 模型覆盖 `80%` | 800,000 |

模型数字基准大于标准窗口，或 `fN` 达到标准窗口，在存在扩展 tier 时可以即使 `extendedContext=false` 也启用扩展窗口；百分比不自动启用。SDK 不经过 TUI 二次确认。真实 registry 已测 128K/512K fixture 的边界与禁用模型覆盖时回到标准窗口。允许更大的窗口不等于立即增加费用，只有实际请求跨供应商计费阈值才可能改变计费。保留原生 policy，不复制到 App。

## 初次独立实施范围

- package.json 两个 OMP 直接依赖及同族两锁固定 18.8.9；pnpm 发布年龄例外只放行所需精确版本。Bun lock 同步基点已经声明但未进入旧 Bun importer 的三个 dnd-kit 包，没有升级这些声明。Bun/Node/pnpm/Electron 版本不变。
- prepare/Main/environment/afterPack 强制新版本与未修改官方 sdk.ts 的 SHA-256 `4b9f9aa2a62deacfbe36fa0ea0e262b2c4d753fb724de0dea8a0e379bf60f8c8`。保留资源真实根、launcher hash、锁、原子 staging 与失败保留旧资源，未新增原生源码补丁。
- 官方包源布局与 Linux loader 已复核，版本限定 CLI bundle 裁剪/baseline-only 规则更新到 18.8.9，650/1000 MiB 门禁不变；未知版本仍不套用这些裁剪。Linux loader 单元测试通过不等于 Linux GUI 实机验收。
- 新转换的 PDF/其他文档 provenance 改为实际 18.8.9；已有记录不迁移。当前基点的官方 XLSX 行为未在本次另行修补。
- 新增实际 SDK 参数、压缩语义/扩展窗口、fork unknown 验证，以及真实 Host 的工具执行 → 同 file/ID 冷恢复加密推理 → 自动 handoff 压缩 → 显式继续；加入 `pnpm validate:sdk`。隔离 HOME/OMP/App/Git 配置与临时项目，provider 只用注入 fetch 或 localhost。
- 当前基点和 SDK 默认压缩策略保持。验收 fixture 为确定性验证使用 `asyncEnabled=false`、`midTurnEnabled=false`、固定 12000 token 阈值；不把这个 fixture 写入用户配置。

## 初次独立验证

19 项资源/tooling 场景先在新版 fixture + 旧门禁下出现 10 个预期失败，再同步门禁全部转绿。SDK 元数据、哈希变更拒绝、活跃锁、失败原子保留与未知版本资源策略断言均保留。

| 检查 | 结果与边界 |
| --- | --- |
| 冻结安装、固定 Bun lockfile-only、环境检查 | 通过；51/51 精确依赖，Bun 1.3.14、Electron 44.4.5、SDK 18.8.9 |
| runtime:sdk | 通过；112 个物理包、477.1 MiB，真实 factory 和 Transformers 惰性 Node import，无模型下载 |
| 现有 validate:sdk 四项 | 通过；队列 Stop/Continue、ACK 后失败、结果/关联、manual compaction/input 竞争 |
| 新 provider / Responses session | 开发资源与最终目录包均通过；10 个参数场景、压缩语义/扩展窗口、fork unknown；真实 read、加密历史冷首请求、自动压缩落盘/继续共 5 个 localhost 请求 |
| 最终包 SDK cold-resume | 通过；空会话及同 file/ID，失效模型/default/role、错误 cwd/identity/文件拒绝，显式替换；无模型请求 |
| build、mac arm64 目录包、包内 Main/preload/Host | 通过；App 780.7 / 1000 MiB。SIGKILL 自有隔离实例后保留同 Thread/file/ID、JSONL/草稿；缺模型失败仍可读，显式换模型恢复。localhost 1 次请求 |
| 模型配置与阅读 | 19 项配置/热切换通过，0 真实供应商请求；阅读 probe 通过：1002 记录/12 页/2,250,080 字节、同工具身份/partial coverage/追加 continuation。probe 明确 fixture 模型避免无模型冷恢复依赖外部默认值 |
| 项目完整检查 | 未通过；基点已有类型、测试、source-boundaries、结构清单问题，见下述限制。不能称全仓绿色 |

目录包 `dist/omp-sdk-1889/mac-arm64/d-pi.app` 的 build id 为 `1e73213e-dirty-7e9f06fd`，asar SHA-256 `5064e087907704cc0361e458bbcc6cb836bdacb310b70facb07fbd8b7341d571`，是提交前工作树候选；不冒称提交后的另一个构建。[包检查](evidence/package-smoke.json)、[资源](evidence/resources.json)、[冷恢复](evidence/cold-resume.json)。包无签名/公证，未进行用户试用认可。

基线复核使用 git archive 的干净基点副本，直接运行 tsc/隔离测试；没有改附件会话的文件。一次在副本调用 pnpm 触发隐式安装，经共享的 node_modules symlink 改了本任务的安装链接；已在本 worktree 强制冻结重装，并刷新依赖检查/tooling/测试。prepared SDK 和目录包独立，未受影响。Electron 自动下载失败，使用原 checkout 已安装且版本核对为 44.4.5 的分发只读复制到本 worktree，再测实际 executable metadata；未修改源分发。

## 初次交付的未覆盖与整合边界

未访问真实供应商/个人认证/扩展，未测量计费与缓存，未重新验收 TUI 新功能、其他平台或首次 grammar 下载。完整检查的既存失败不在本次升级里顺手修改，尤其不改另一会话负责的附件与展示代码。

另一会话当前有绑定 `@oh-my-pi/pi-coding-agent@18.8.7` 的附件/XLSX patch 与资源准备改动。本分支未复制其未提交实现。未来整合时必须按对方最终提交，把 patch 的版本及哈希重新核对到 18.8.9，复测 XLSX/附件与资源门禁，再重新准备资源；不能仅合锁文件。本次 commit 不代表组合分支已验收，不自动合回其 checkout。

## 回滚

停止使用该 SDK 的 App/受管进程，确认资源锁释放；保留原生配置、数据库一致备份（含 WAL/SHM）、JSONL、App 数据与附件。声明、两锁、workspace 精确例外、哈希门禁、资源策略与 provenance 作为一个范围回退到基点，再冻结安装并重建 18.8.7 资源。不要单独降版本或覆盖使用中的 SDK，不删除数据或建立替代会话。若升级期间用户自行用了 `fN`，18.8.7 不接受该新格式，先在隔离配置副本验证降级兼容；原件保留。新版历史可读不等于旧版可继续执行，必须用隔离副本确认。

基点已有失败已逐项复核：root typecheck 的 SubmissionId brand/附件标签 data 属性两处；测试中的附件规范路径、迁移/索引 fixture 及 sidebar/workbench 旧断言；source-boundaries 的 context-token.css raw color；dependencies.generated.json 陈旧。对应代码在本次版本替换之外没有改动。验证入口未关闭或放宽；升级专属资源测试、tooling、host/main/core/preload 类型、lint/design/i18n/interaction 与架构边界/40 项架构测试分别通过。最终 `pnpm test --maxWorkers=2`：244 文件通过、7 失败、1 跳过；1626 测试通过、10 失败、2 跳过。10 个失败的名称与干净基点复核集合完全相同，见 [基线逐项证据](evidence/baseline.json) 与 [最终检查汇总](evidence/validation.json)。144 项 tooling、40 项 architecture 测试通过。完整 `pnpm check` 仍非绿色，既存失败不隐藏。

独立只读 review 覆盖冻结快照的 43 个文件及 SHA、Spec/Standards、双锁与资源门禁、两个新增验收脚本及六份产物证据；额外核对实际随包核心版本、Bun、SDK/lock/15 个 launcher 哈希、asar 和官方实现。未发现需阻止提交的可行动问题；reviewer 没有代跑验证，结论基于源码、产物与实际日志。review 后生产源码和测试脚本与冻结快照的哈希完全一致，仅补齐本规格、阅读/基线/最终汇总及看板。

## 项目状态

```project-status
[{"id":"omp-sdk-1889","title":"OMP 18.8.9 隔离升级","phase":"基建","engineering":"complete","trial":"not-delivered","acceptance":"pending","current":false,"build":"Dev SDK 18.8.9 + 固定 XLSX patch；旧目录包不覆盖本次组合","evidence":["spec.md","evidence/validation.json","evidence/package-smoke.json","evidence/integrated-validation.json","evidence/integrated-cold-resume.json"],"next":"从合入后的 main 试用；原 checkout 的安装/SDK 仍需在资源无占用时同步。真实供应商与用户认可待验证。","constraints":"用户已授权本地 PR 合 main 后 push；完整检查存在已复核的当前 main 基线失败，不公开发布，不终止附件会话进程。"}]
```

## 本地 PR：OMP 18.8.9（2026-10-11 追加授权）

用户明确要求本地 PR 到 main，随后 push。目标 `origin/main`，源 `codex/omp-sdk-1889`；当前集成基点 main `e3050f9a7218c90755d76b60bcc580b7aa5cfa7b`，原升级提交 `c24c2e8324067846c0290419b3f33b8dc425c705`。原 checkout clean，附件修复已经提交；在隔离 worktree 合入它、解决冲突、验证后才更新 main。不创建 GitHub PR 或公开发布。

### Summary

空参数终止事件会破坏 Responses/Codex 已收齐的工具参数，通用 Responses 冷首请求会丢失已有加密推理。本地 PR 将 SDK 与同族依赖固定到 18.8.9，同步双锁、资源/启动/包后哈希门禁并增加实际 SDK 验证；Bun 保持 1.3.14，原生执行与历史仍由 OMP 拥有。

整合 main 的附件修复：pnpm XLSX patch 从 18.8.7 改绑到 18.8.9，补丁字节和修复后 source SHA 完全保留。错误输出/覆盖信息/预览/图片/原文件与冻结内容语义保持；新转换 provenance 标记 18.8.9，已有 18.8.7 记录不重标。prepare 核对 XLSX 的固定 SHA，manifest/启动哈希消费与 main 一致。合锁后实际冻结安装，使用带 patch 的 pnpm 闭包重建 SDK；Bun lock 保持原有包版本锁用途，不作为原生运行闭包来源。维护说明与第三方说明同步版本化补丁；生成结构清单刷新且通过检查。

### Evidence

- 实际 pnpm patch bytes 与 `e3050f9a` 相同，patch hash `28944cc074fbaa7212ccac8c9a496266d51ef8a8dbf3f16cebc55cb5f1d4ef53`；XLSX source SHA `c3530cc197cc4fb4e4fbd3509da50e6a789a07e0b14da3470523cf7b534ffad4`，sdk.ts 仍为未修改的官方 `4b9f9aa2…`。
- `pnpm install --frozen-lockfile`、固定 Bun lockfile-only、`runtime:sdk`、`check:environment`、`validate:sdk`、144 项 tooling、build、lint/design/i18n/interaction、documentation、architecture/structure 与 main/host/core/preload typecheck 通过。实际冷恢复另复测成功。资源用户排他、失败原子保留保持；新增补测缺失/改动 XLSX patch 拒绝且旧资源 manifest 不变，这是既有正确行为补测，不声称新生产 TDD 红灯。
- 31 项附件复测通过，包含实际固定 SDK 的全部可转换文档/Notebook、PDF OCR 覆盖、XLSX namespace 与多 sheet/稀疏/乱序坐标、冻结剪贴板和旧记录修复。没有复用旧目录包冒称新组合包，未再次运行真实 GUI/真实供应商。
- 全量 `pnpm test --maxWorkers=2`：243 文件通过、8 失败、1 跳过；1639 测试通过、11 失败、2 跳过。10 个是原干净基点已复现的失败；新增 window-security fixture 缺少 `isDestroyed` 在干净当前 main archive 同样复现，未改权限生产逻辑。当前 main 的 4 处 root typecheck 错误逐行在干净 archive 复现：原有 SubmissionId brand/标签属性及附件修复测试中的两处可能 undefined。source-boundaries raw color 仍是既有失败；完整检查仍非绿色，不关闭门禁或更改 CI。
- 独立组合 review 找到历史 XLSX fixture 标签被错误改成 18.8.9，与生产旧记录修复条件不符；已恢复旧标签，两个新转换标签仍为 18.8.9，并由 31 项复测证明。最终补充独立 review 已核对 51 文件快照、修复后的标签、31 项附件复测及 11 份日志 SHA，未发现剩余可行动问题，可以按授权合入并 push；reviewer 未代跑验证，初次独立 review 不替代这次组合审查。
- 原始日志 SHA、失败列表、命令、版本和覆盖见 [组合验证汇总](evidence/integrated-validation.json)；[组合冷恢复](evidence/integrated-cold-resume.json)。

### Merge Danger

源码/资源可回退，但需作为一个范围恢复到集成前 `e3050f9a`（含原附件 18.8.7 patch），冻结安装并重建旧 SDK，不能只降 package.json。保持 App 数据/配置/JSONL/附件及数据库一致备份；原生 `fN` 新格式和新版历史继续执行兼容需在副本验证。压缩阈值数字含义/扩展窗口选择沿用上方官方核实，检查的有效配置没有模型覆盖，本地 PR 不写用户配置。资源替换必须无占用；不结束其他会话进程。

本地 Git 合入后按授权 push main，实际 head/远端结果在收尾核对。合入与 push 不代表全仓 CI 通过、候选正式发布或用户认可。原目录的 node_modules/resources/sdk 仍是先前版本，避免干扰使用中的进程，本轮只在隔离 worktree 准备/运行升级资源；原目录启动 Dev 前需在资源可替换时冻结安装并重新准备 SDK。
