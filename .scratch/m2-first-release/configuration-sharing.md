# 共享配置回归修复（2026-10-01）

范围：用户明确要求查明并修复 OMP CLI 登录后 Electron 不可读的根因，核查验证漏检，以及 Electron 先授权、以后安装 CLI 的反向共享。沿用 D-03/D-04、ADR-0002 和 M2 02；仅本地候选，不 push 或公开发布。个人凭据只读观察，不调用真实供应商、不刷新 token、不发送模型请求。

## 根因与此前漏检

1. m2.7 `runtime/configuration-readonly.mjs` 检测到非空 `agent.db-wal` 就抛出 `database-active-wal`。CLI/Host 打开原生库时，正常已提交的 OAuth 可仍在 WAL 中，代码错误地令 credentialsKnown=false、认证=null，所有模型标记 configuration-unknown。这是读取适配的代码与验收边界错误，不是用户未登录，也不能靠要求用户关 CLI 才使用 App。
2. 同一读取路径把 ModelRegistry 的缓存固定为 `:memory:`，只标记 cached-catalog-unobserved，不导入 CLI 已发现的目录。认证恢复也不保证缓存模型出现。
3. 上轮 13 场景只读矩阵覆盖静态文件、闭库、无认证和破坏性异常；没有 CLI 登录后保持库打开的正常共享场景。正常 WAL 的保守失败被写成完成边界，测试验证文件不变却没有验证 D-03/D-04 的核心用户结果；真实包主要使用 env/custom fixture，未覆盖 WAL OAuth 和已缓存目录。测试数量和包内执行成功因此没有拦住产品回归。
4. partial snapshot 的 Main 诊断仍记录 confirmed，且不保存非秘密 issues；用户问题发生时历史日志无法指出原因。增加 unknown/原因码，避免再次只见传输成功而丢失不可读事实。

用户本机 m2.7 只读观察确认原生根一致、schema8、有一条未禁用未过期 OpenAI OAuth；WAL 静止时同包读取 OpenAI=true、8 个可用 GPT，未验证供应商远端授权/计费。截图当时的旧诊断未记录 issues，因此不声称能回溯证明它的唯一失败原因；隔离复现证明正常 WAL 本身足以触发相同缺陷。

## 修复与验证边界

- SQLite readonly + query_only + 有界 busy_timeout + 明确读事务，读取已提交 WAL；不 checkpoint，不迁移/修改持久凭据、配置或源模型目录。允许 SQLite 管理协调 WAL/SHM。静态文件/缺库的原有无写矩阵保留，不能以文件绝对零变化拒绝正常数据库并发读取。
- 源模型缓存通过 SQLite serialize 一致快照交给私有 0700 临时目录/0600 文件中的官方 ModelRegistry。版本、materialization、freshness、header restore 和合并由官方代码处理；不复制模型规则，副本及协调文件在 finally 删除。未知账户专属目录、remote auth、不兼容/损坏/不安全来源仍准确标记，不能承诺未验证的任意外部版本兼容。
- `validation/m2/configuration-sharing.mjs` 使用隔离 HOME/配置/项目/网络和实际 OMP 18.4.6 模块。CLI 持有 WAL：官方 AuthStorage 存 OAuth、Settings 写默认模型、官方 writeModelCache 写新发现模型，App snapshot 应返回认证、默认值与可用缓存模型，并验证持久源文件哈希/权限不变。
- 初版红灯：OpenAI 实际返回 null、issues=[database-active-wal]。修正 SQLite 读取后，新增缓存模型仍缺失的行为断言红灯；导入一致缓存快照后两项通过。诊断红灯：partial 返回 confirmed 且无 causeCode，修正后 unknown/有界原因码成立。
- 反向：外部 omp 不在 PATH，干净环境通过应用的实际 configuration login/save-key 入口运行官方 OpenAI OAuth 回调与 DeepSeek GET 验证（仅 fixture）；随后官方 CLI 读接口及官方发布包 `dist/cli.js --mode rpc` 的 get_available_models 无需重登识别两供应商。真实 OAuth 用户浏览器和远端账户状态不由 fixture 证明，真实供应商请求 0。
- 新集成测试进入 `pnpm test`/`pnpm check` 常规门禁，保留双向正常路径；不再仅作为手动验证脚本。Thread 临时模型按已有原生合同隔离，未改写 CLI 全局默认；共享的是持久原生配置和凭据。

## 当前状态

针对性红绿和完整 `pnpm check` 已通过：453 Vitest 通过、1 项既有 CLI artifact 跳过，类型/Biome/设计/i18n/文档/结构/状态及架构/工具门禁通过。既有只读 13 场景也通过。用户原生根只读重读返回 coverage=complete、OpenAI=true、9 可用模型且 gpt-6.1-sol 可用，见 [本机摘要](evidence/configuration-sharing-personal-read.json)。红灯见 [WAL 对照](evidence/configuration-sharing-wal-red.txt)，绿灯见 [双向结果](evidence/configuration-sharing-green.json)，完整检查见 [check](evidence/configuration-sharing-check.txt)。实际随包复验与本地 m2.8 候选身份在构建完成后追加；工程通过与用户试用认可分别记录。

官方依据：[SQLite WAL 的提交、读事务和只读支持](https://sqlite.org/wal.html)，[Bun SQLite readonly 与 serialize](https://bun.sh/docs/runtime/sqlite)，[固定 OMP 18.4.6 ModelRegistry](https://github.com/can1357/oh-my-pi/blob/v18.4.6/packages/coding-agent/src/config/model-registry.ts)。模型缓存源的兼容、freshness、header restore 不由 d-pi 重写。
