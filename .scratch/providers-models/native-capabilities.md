# OMP 18.4.6 Provider 与 Model 薄接入

2026-10-08；基线 f649457；只使用固定安装的官方源码。全部原生认证范围由用户当前明确授权取代 D-23 历史两入口限制。本记录不修改 spec/票状态，不代表真实供应商验收。

## 原生能力与接入点

- `pi-ai/src/registry/oauth/index.ts:160` 的 `getOAuthProviders`、`pi-catalog/src/compat/auth.ts:13` 的 `authProviders/authPolicyFor`：官方登录注册表和 declarative policy。方法 id 与 `storeCredentialsAs/storeAs` 分开，DTO 汇总到存储 provider。kind 是 api-key/oauth-code/device-code/custom；validation probe 是 models-endpoint/chat-completions/anthropic-messages。后两者可生成并计费，不在读取时运行。
- `pi-ai/src/auth/oauth.ts` 的 `login` 解释原生 callbacks、normalization、validation 和多账户 upsert；桌面传递 onAuth/onProgress/onPrompt、placeholder/allowEmpty/secret、onManualCodeInput，不复制 OAuth/device-code。原生 api-key engine 未声明 secret 的 prompt 在桥接侧保守遮罩。
- `pi-ai/src/auth-storage.ts` 的 `credentials.upsert/removeById`（实现落点为 auth/pool.ts）：原生静态 key 保存和单 credentialId 删除。不能调用 `set/remove(provider)` 覆盖/删除整个组。API-key flow 校验失败时先前凭据保持；没有 native key flow 的标准/custom provider 以原生 upsert 保存，DTO `keyValidation:none` 明确未联网校验。env/config 来源与存储账户分别展示。
- `pi-coding-agent/src/config/model-registry.ts` 的 `getAll("all")/getAvailable("all")`、`hydrateCredentialScopedModelCaches`、`refreshProvider(provider,"online",{refreshCommandCredentials:false})`：所有 kinds 目录、非命令 offline cache 和明确在线 discovery。默认 getAvailable() 仅 chat；`filterAvailableModelsByEnabledPatterns` 与 cfgEnabledModels 派生 sessionSelectable。刷新后原生 discovery error/unavailable/unauthenticated 返回明确失败。
- `pi-coding-agent/src/config/model-roles.ts` 的 `getKnownRoleIds/getRoleInfo.accepts`：15 个内建 role 及配置自定义 role。default/smol/slow/vision/plan/commit/task/advisor 接受 chat；tiny/memory 接受 tiny/chat；image/web/speech/dictation/judge 按原生 predicate。DTO assignableRoles 来自 predicates，不复制品牌规则。
- `pi-coding-agent/src/config/settings.ts`：`loadIsolated` 的 `setModelRole` 是 global 写；`setProjectModelRole/clearProjectModelRole` 是 project 写。`getModelRoleProvenance/getGlobalModelRole/getProjectModelRole` 保留原生层级；application scope 禁止 project 写。`cfgDisabledProviders.setMember` 是原生 provider 启用入口。
- `pi-coding-agent/src/config/models-config.ts` 的 `ModelsConfigFile.schema/validateProviderConfiguration`：公开原生 schema 和完整 provider 验证，无公开 CRUD saver。模型文件优先 models.yml/yaml/json，与原生路径一致。对同文件执行原文+revision 检查后 mode0600 临时文件 fsync/rename，合并目标模型字段，保留原生 API key、headers、未知兄弟和未传入 metadata。不是临时 registerProvider。新增 provider 使用 auth:oauth 读取原生 credential store，不另复制 key。
- `pi-catalog/src/models.ts` 的 `getModelPricingStatus`：0 cost 未必免费；fixed/free/included/variable/unknown 直接投影。API 标识允许 extensions，官方没有公开可靠完整运行时 API enum；standard provider 继承 metadata，新增 provider 明确输入 api 并由原生 schema 验证，不声称 schema 验证证明运输协议可执行。

## 只读与身份保护

有限只读事务读取 schema8 active credential rows，native AuthStorage 在内存中解释。auth.keys.source 不执行 helper；离线 native peek 的 resolver 禁止 !command；缓存 serialize 到私有临时 DB，官方 header-restoration/版本/账户 namespace 策略只修改副本，用户 models.db 不写。expiry 已过、未知账户缓存、远程 auth、旧 schema 等保持 partial/unknown。目录不启动 Agent/extensions、不刷新 token、不联网、不迁移配置。

写操作先完成同范围 snapshot 的路径/schema检查，然后才打开 writable native storage。logout/provider-enable/roles/custom CRUD 需要 expectedRevision。Main 固定 job 的 scope/cwd/trace；旧 job 续步按原 id，嵌套 done snapshot 亦复核身份。URL 仅来自原生 challenge，HTTPS 或 HTTP loopback、无 userinfo；Perplexity 缺 browserSession callback 时沿用官方 email 回退，未实现 Electron cookie/SSO。

App 内串行和 CAS 不能提供原生 CLI 的跨进程锁；检测出的冲突拒绝，不能保证外部 writer 恰好在最后一次检查到 rename/原生 commit 的窗口内完全互斥。未知源/损坏文件不修复。配置仍是 OMP 共享持久化，App 设备收藏/隐藏另由 preferences 负责。

## TDD 与隔离证据

真实红灯：providerId login/单账户带 revision 合同先被旧 schema 拒绝；Main 原 login 丢失 providerId；原 runtime 无 logout/custom-model handler；OpenAI/Anthropic native key 保存元数据缺失；unsafe models symlink 写入在打开 native writable DB 前未拒绝。补最小实现后通过。GitHub cache fixture 起初被原生拒绝遗漏 headers，按官方 writeModelCache restorableHeaderFallback 构造正确 fixture 后，真实 offline hydration 通过；未绕开原生 cache 规则。

- `tests/tooling/provider-models.test.mjs` 9 项使用真实固定 SDK 与隔离 HOME/config/cwd、fetch fixture：全登录 metadata、多账户精确删除/API key与OAuth兄弟保留、provider-enabled/revision、global role、custom add/update/delete/秘密和未知兄弟保护、原生 key normalization/拒绝保留、账户 scoped cache source不变、unsafe写前保护、refresh失败/helper保护、交互遮罩/取消无存储、project role设置/清除/global fallback。8 项全量通过；随后 project role 和最新兄弟保留分别通过定向重跑，未重复无关矩阵。
- `validation/m2/configuration-readonly.mjs` 13 项真实源隔离检查：hash/mode/文件集合不变，legacy、缺DB、命令key、外部引用、project overlay、symlink、旧schema、坏DB/缓存和坏project配置均不改写。
- `validation/m2/configuration-sharing.mjs` 6 项检查：live WAL CLI认证/缓存复用、原生缓存拒绝与partial、桌面官方login持久化、CLI启动读取、真实官方CLI RPC模型列表，全部 realSupplierRequests=0。
- `pnpm test src/modules/configuration/contracts/provider-models.test.ts src/modules/configuration/main/native-configuration.test.ts tests/integration/configuration-identity.integration.test.ts`：3 文件16测试通过。core/main/preload typecheck、architecture（488文件）、documentation（338 Markdown）、Biome/diff whitespace 通过。初始architecture OOM源于 scanner 不重扫 URI regex literal；URL安全校验改为 string includes/split 后，普通 heap 下通过。
- `pnpm runtime:sdk`：112 packages、548.4MiB/650MiB；SDK 准备使用未修改官方依赖图，已有 SDK 导入修正授权例外保持。最终 prepared SDK 的 readonly 13 项同样通过；源侧 configuration-sharing 6 项包含官方 CLI RPC 读取通过。没有新增资源文件，无 manifest schema改动；既有prepare脚本复制并 hash两个配置adapter及现有model-selection。

未运行 GUI/E2E、个人配置、真实 OAuth/API-key/供应商网络、计费请求、push 或 merge。工程隔离证明不等于真实供应商账户已验收。
