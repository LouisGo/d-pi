# S2 文字发送与阅读试用交接

2026-09-28。文档先提交为 `3288baf`，随后实现；用户随后授权修复独立 review 的 3 项问题并本地提交 S2 实现，具体提交以 Git 历史为准，不推送。官方 OMP v18.3.0 未修改，固定版本与 SHA-256 见 `resources/omp/manifest.json`。本轮授权限 S2，不开启 S3/M2。

## 2026-09-28 独立 review 修复

后续三项领域/生命周期结构调整已完成，详见[领域边界巩固与 S3 进入条件](../s2-boundary-hardening/spec.md)。下文工程数量是各轮历史记录；最新检查以该记录为准。当前仍未实施 S3。

- Main 绑定实例启动时的目录身份；同路径目录被替换后，重新授权不能将旧实例用于新目录。prepare/dispatch 都保留准入保护，未派发记录不会自动重发；未换目录的撤销/重新授权仍可正常发送。
- Host 识别官方成功响应的 `data.agentInvoked:false`，查询原生状态后恢复空闲；普通 ACK 或 `agentInvoked:true` 不作为结束。真实 utility Host + 官方 OMP 连续两次 `/model`、空闲退出通过。
- 新窗口首次接收 Runtime 状态即订阅现有阅读投影，中断状态也能读取；启动前的浏览订阅会在 ready 时重新连接，不启动或重启 OMP。

三个缺陷均有先失败后通过的回归测试，另覆盖已准备记录的目录替换、正常重新授权、普通 ACK 不解锁、浏览到 ready 重连与原生断开后 Host 保留片段。统一检查和构建通过；当前 72 项单测通过、1 项可选官方双轮 smoke 默认跳过。检查输出见 [review-checks.log](evidence/review-checks.log)。真实本地命令集成由 `pnpm exec electron validation/s2/host-smoke.cjs` 验证，无个人配置/凭据或供应商调用。

**本节修复已进入源码，使用 `pnpm dev` 可运行；下述 `dist/s2-candidate` 仍是修复前的历史试用包，未重新打包或重新进行 GUI 验收。** 旧构建指纹和截图不作为本次修复验收。S3、真实中文输入法和用户配置/体验仍未验收。

## 当前可操作范围

在一个 Thread 中：选择项目 → 明确允许项目执行 → 启动随包 OMP → 空闲时发送文字 → 阅读回复与工具输出 → 同一存活原生会话继续第二轮。支持发送时继续起草、冻结原文查看/复制、调用回执与执行失败分开、只读原生历史、窗口关闭后重新接回输出。

清稿依据是已落盘的调用 ACK 和该次草稿编辑序号，**不是业务接受或完成**。原文先冻结，再派发；ACK 与消费标记同事务。新稿 B、IME 和同文新编辑不会因 A 的回执被清掉。结果未知不会自动重发。

默认 Enter 发送、Shift+Enter 换行；可切 Enter 换行/⌘Enter 发送。展开编辑区临时采用后一模式，收起恢复偏好。URL 原文不变，GitHub/通用网站图标本地显示，不访问网页或 favicon。Markdown 阅读使用 Streamdown + Shiki，远程图片不自动加载，链接目前显示完整目标并可复制。

## 启动与试用

正式包：`dist/s2-candidate/mac-arm64/d-pi.app`，版本 `0.1.0-s2.0`。旧 `dist/s1-candidate` 未替换。

```sh
# 开发：首次克隆先获取固定官方 Runtime；已有校验正确的文件会复用
pnpm install --frozen-lockfile
pnpm runtime:fetch
pnpm dev

# 正式包：使用独立的 App 数据目录，避免改动旧 S1 试用数据
D_PI_DATA_DIR="$HOME/Library/Application Support/d-pi-s2-trial" \
  ./dist/s2-candidate/mac-arm64/d-pi.app/Contents/MacOS/d-pi
```

`D_PI_DATA_DIR` **只隔离 App 数据**，不会隔离原生配置。正式试用沿用从启动环境发现的 OMP 配置；需要明确选用另一套已有配置时，在同一启动命令设置对应 `PI_CODING_AGENT_DIR` 或 OMP profile。应用不复制凭据，也不启动 shell 补环境。模型名称可见不等于认证已验证。

建议用可接受执行的隔离项目和已有可用模型配置，先发一段文字，等空闲后再追问首轮内容。发送时输入 B，核对 B 保留；展开提交记录查看 A；再试关窗重开、主题/密度、快捷键和实际中文输入法。目录授权会允许 OMP 使用当前用户的系统权限，不是工具沙箱。

## 验证与证据边界

- 类型、Biome、设计 lint、token/Icon 边界通过；Vitest 23 文件/63 项通过，另 1 项官方原生 smoke 默认跳过（本轮已独立运行过）。TDD 记录包含缺失实现、真实 SQLite 故障、协议字段多传被拒、投影 JSON 转义预算及重同步前增量等红→绿修复；既有行为补测不冒称历史 TDD。
- `validation/s2/app-start.cjs`：真实 Main/preload/Renderer/utility Host/官方 OMP；仅浏览/只读查询不加载项目 sentinel，允许执行后加载；实际编辑器的合成 composition、展开换行、快捷键持久化、本地 URL 图标与主题/密度操作通过。不是原生中文候选窗手感验收。
- `validation/s2/app-send.cjs`：隔离本地模型服务、真实普通 prompt，两轮沿用同一 native session，第二轮请求含首轮输入/回复；真实 ACK 落盘、A 清/B 保留、直接 MessagePort 阅读、只读历史通过。HTTP 400 原生错误可见，ACK/原文保留；该错误没有逐提交身份，不伪造关联。同 ID 迟到 error 由固定源码和协调器合同测试覆盖。
- `validation/s2/lifecycle.cjs`：流式过程中退出被保护，关窗再激活能恢复投影；Host 意外退出后原文/unknown 保留，未知活动仍受退出保护，无自动重发。
- `validation/s2/host-failure.cjs`：启动时目录身份不符，Host 报错并释放，不把启动失败留成无法退出的活动工作。
- `validation/s2/package.mjs`：真实未签名 macOS arm64 包复制到含空格路径后，使用随包官方二进制完成两轮、S1 数据迁移、ACK/原文和历史检查；模型服务、配置、项目、App 数据全部隔离。未使用个人凭据，不是真实供应商验收。

真实 macOS 输入法、使用手感与用户模型配置仍是**已交付待试用**，不能把上述结果记为用户认可。没有验证 Windows/Linux、签名公证、干净机器安装、M2 长输出或 4 MiB 编辑性能。

## 当前边界

- 空闲发送；忙碌时继续保存草稿。排队、干预、停止、回答完整原生交互和进程重启后的执行恢复属于 S3。出现原生待交互会显示限制，不默认替用户回答。
- 关窗保留 Runtime。完整退出后，这个 Thread 可以读原文/历史，但不会偷偷新建原生会话继续执行。需要长期续聊恢复的用户应等 S3。
- 资源缺失、校验不匹配、不可读/不可执行有明确提示。原生配置启动失败未提供足够结构化原因时，仍显示未知原因；没有通过猜测把它标成缺失、权限或兼容性问题。
- 阅读投影最多 8 MiB/1000 条，超出显示缺口；原生记录仍由 OMP 持有。只读历史按文件追加顺序分页并保留父记录 ID，不冒称模型当前分支上下文；文件变化需重新读取。超过单页预算的单条原生记录明确返回不支持。
- 冻结原文不清理，界面当前显示最近 100 条提交；不会把它们按正文去重成原生历史。完整原文仍在 App SQLite 收据中。
- ACK 等待 30 秒后标未知，关联保留最长 15 分钟/128 条；到期展示关联窗口缺口，不能继续逐提交归因。Unknown 无自动重发。

## 正式产物标识

构建 ID：`3288bafc-dirty-25e1cb32`。`app.asar` SHA-256：`08e624804b1870fe2e6a4bc227f408bc73cc71c69143150e1510329981c5da92`。

最终包验证退出码 0；[检查输出](evidence/checks.log)、[正式包输出](evidence/formal-package.log)、[浅色代码阅读](evidence/package.png)、[深色紧凑代码阅读](evidence/package-dark.png)。测试数据与截图仅含本地 fixture。构建之后仅更新任务交接与验证脚本说明，未修改产品源码。
