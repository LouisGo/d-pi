# 复核与修复交接

2026-10-09，基点 `c14297c382fbf436d201605e0c0c9d04a4e0b637`，交付分支 `codex/linux-e2e-repair`。用户在完成本地修复后授权 commit 并创建指向 `main` 的 PR；最终版本身份由 Git 提交和该分支的 PR 记录提供。范围见 [spec](spec.md)，工程验证见 [validation](validation.md)，独立评审见 [review](review.md)。

## 证据复核与结果

用户附件 `D-PI_Linux_原生GUI测试报告_2026-10-08.md.txt` 和 `D-PI_Linux_GUI_证据包_2026-10-08.zip` 的受测 SHA 与本地基点相同。ZIP 的 61 个索引文件 bytes/SHA-256 全部一致；报告中的截图、日志和环境限制相符。原件不改写，报告通过的离线输入/保存行为与受阻的 Provider/Host 能力分别保留。

| 报告项 | 根因与修复 | 当前证据与限制 |
| --- | --- | --- |
| D01 菜单不可见 | 全局 isolation 将嵌套 Base UI Portal 困在低层；只隔离 body 的外层 Portal，让嵌套菜单与模态共享层叠上下文 | macOS Electron 44.4.5 复现原错误；修复后普通/搜索 Select 可见、命中、鼠标双向选择，Escape 返回 trigger 并保留 Settings。Linux 原生复试待做 |
| D02 模型栏横向滚动 | 固定 flex 宽度不足以容纳按钮、padding、border；改为内容尺寸，保留纵向滚动与滚动槽 | 短/长 rail 均 scrollWidth=clientWidth=46；长列表可滚动并点击底部 provider。Linux 系统滚动条待复试 |
| B01 SDK 超预算 | Linux x64 同时带 baseline/modern；固定 18.4.6 只携带官方 baseline，沿用 loader 回退 | 不修改 binary、许可、未知文件或 650 MiB 预算；复制/审计/准备事务测试通过。按报告减去 modern 的 190,006,544 bytes，预计约 592.6 MiB；这是推算，真实 Linux 总量和 SDK import 待复试 |
| U01 读取失败恢复 | Settings 和模型目录提供只读 Retry；Settings 显示请求 trace；模型失败时不再同时显示搜索无结果 | 行为回归验证重试再次读取；没有可用模型与搜索无结果分别表达，不自动重试写入 |
| U02 空白窗口无法退出/提示叠加 | 窗口收到首个 ready 草稿快照前不要求不存在的 Renderer 保存回执；此后始终保留保护，同窗口握手和恢复提示合并 | guard、真实 Main/SQLite IPC 集成验证初始关闭、保存成功/失败、超时、迟到 token、提示去重。执行退出仍经过 QuitCoordinator |
| B02 build 137 | 只证实 Killed/exit 137；具体终止来源未知 | 本机生产构建通过，不作为 Linux 构建通过或 OOM 结论；没有调整 heap、禁用门禁或修改构建规则 |

组件回归截图：[修复前](evidence/select-before.png)、[浅色修复后](evidence/light-select.png)、[深色修复后](evidence/dark-select.png)，测量记录见 [ui-popups.json](evidence/ui-popups.json)。这些是隔离 HOME/XDG/OMP/data 的真实 Chromium 组件输入证据，不是 Linux 原生 App 或真实供应商 E2E。

## 原 Linux 机器复试

先将本次源码变更应用到 Linux checkout，确认版本/差异，并退出该 checkout 的旧 App/受管原生实例，再顺序执行：

```sh
pnpm install --frozen-lockfile
pnpm runtime:sdk
pnpm check:environment
pnpm build
pnpm dev
```

同一机器已有匹配依赖时可省略 install。`runtime:sdk` 必须在原平台完成资源预算、hash 与实际 SDK import 门禁；不要复制 Mac 资源或手改 manifest。保留命令完整日志和实际 SDK bytes。若 build 仍 137，记录失败时间、进程退出信息及可访问的系统/cgroup 终止记录，先辨明终止来源，再决定是否需要环境或构建修复。

1. 双主题、宽/窄窗口打开 Provider Settings 的 scope，下拉菜单应可见；鼠标切换两种 scope；Escape 只收起下拉并返回焦点。普通和搜索 Select 都检查。
2. 模型目录检查短/长 Provider rail，不能出现多余横向滚动；长列表可以纵向滚动并选择底部项。读取失败应只显示错误与 Retry；重试恢复后展示真实目录。
3. 复现原报告的“首轮 Renderer 从未加载可编辑界面”，关闭窗口/退出应可完成；正常编辑后保存、退出、重启仍保留原稿。编辑后 Renderer 无响应或保存失败仍保持窗口；连续退出不叠多个提示。
4. SDK 与生产 Renderer 可用后，再补原报告 BLOCKED 的 Provider/auth、真实模型请求、图片、Host 队列/Stop 等矩阵。使用原报告的隔离配置/受控 fixture；真实账号和供应商调用按实际授权进行，不能由离线输入通过推断这些能力通过。

工程交付完成；原 Linux 平台复试及用户认可待反馈。没有固定 Linux 安装包或完整 Linux 支持承诺。
