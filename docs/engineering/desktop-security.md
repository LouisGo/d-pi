# 桌面安全边界

本页把 [基础契约 §5](../architecture/foundation-contracts.md#5-最小权限与信任b5) 对应到现有入口与回归方式，方便维护实际边界；不替代领域合同或产品权限决定。

## 当前入口与约束

| 边界 | 实际入口 | 维护时需保留的行为 |
| --- | --- | --- |
| 特权窗口加载 | [Main](../../src/app/main/index.ts)、[构建配置](../../electron.vite.config.ts) | `nodeIntegration=false`、`contextIsolation=true`、`sandbox=true`。打包应用只加载内置 Renderer；开发初始 URL 与 HTTP 重定向目标均只允许无凭据的 HTTP/HTTPS loopback 地址。加载前注册 `will-redirect`，取消越界重定向；开发加载拒绝后回到内置页面，窗口已关闭时不重载，加载失败留有类型化诊断，不能把 preload 带到外部内容。 |
| 页面导航与系统权限 | Main `createWindow` | 页面新窗口、`will-navigate` 和 webview attach 均拒绝；permission request 回调拒绝。不能为了新增浏览器或认证功能直接复用应用特权窗口。 |
| 内容与脚本 | [Renderer CSP](../../src/app/renderer/index.html)、[阅读渲染](../../src/app/renderer/reading/markdown.tsx) | 脚本来源为 self；开发态只为启动生成 nonce。样式允许 inline，图片为 self/data，connect 允许 self 与 localhost 开发连接。Markdown 链接和图片呈现为无操作文本；当前没有自动打开外链或加载远程图片。原生/用户文本仍不可信。 |
| preload 与 IPC | [preload](../../src/app/preload/index.ts)、[IPC](../../src/app/main/ipc/) | 只暴露 `desktop` 的受限域操作，禁止通用 invoke、Node、文件系统或 shell。Main 核对窗口 `webContents` 与 mainFrame，消费边界解析 schema；schema 不替代 Thread、目录、请求代次与资源归属。 |
| App 文件与 Git 读取 | [文件读取](../../src/modules/files/main/project-files.ts)、[Git 读取](../../src/modules/changes/main/project-git.ts)、[实际路径](../../src/platform/node/filesystem/directory.ts) | 规范化实际路径并校验根范围；拒绝逃逸 symlink、越界路径和非普通文件，打开后复核文件身份。Git 查询禁用 ext-diff/textconv，不能因“只读”运行项目脚本。 |
| OMP 执行与配置 | [执行服务](../../src/modules/execution/main/runtime/runtime-service.ts)、[原生进程](../../src/modules/execution/host/native/native-session.ts) | 默认仅浏览，允许项目执行后才启动 OMP/加载扩展。原生工具审批与 App 文件读取是两个执行面；Agent 仍使用当前 OS 用户权限，不宣称目录沙箱。配置与资源维护见 [OMP 接入](omp-maintenance.md)。 |
| 诊断与恢复 | [诊断合同](../architecture/diagnostics.md)、执行服务与收据集成 | 保留 trace/真实身份/类型化失败，不记录秘密或业务全文。unknown 不自动重发；不删除数据、新建替代会话或伪造 ready 掩盖资源/恢复失败。 |

本轮发现并修复的入口缺口：打包应用曾无条件接受 `ELECTRON_RENDERER_URL`，开发态也接受外部 URL；该页面会获得应用 preload。现按打包/开发状态和实际 URL 主机拒绝这两条路径，并保留正常 loopback 开发加载。[行为回归](../../tests/integration/window-security.integration.test.ts) 有两个目标失败样本，另覆盖恶意主机/凭据/协议、无效 URL、合法 loopback 与现有隔离/导航限制；具体红绿和原生结果由所属规格的证据维护。

冻结后的独立审阅另复现了服务端重定向缺口：合法 loopback 页面可以通过 302 跳往 HTTPS 外域，`will-navigate` 不拦截这条路径，外域页面仍能调用 preload 的 locale 与 restore。回归现覆盖加载前拒绝越界重定向、合法本地重定向、取消后内置页回退和关闭窗口的回退边界；修复及针对性原生复核见 [重定向证据](../../.scratch/infrastructure-closure/evidence/security-redirect-results.md)。

## 维护与验证

D-40集成终端尚未实现；未来的Main许可、端口来源/归属、撤销fence、OSC/剪贴板与任意shell权限边界以[终端契约](../architecture/terminal.md)为单源，负例与清理硬门槛见[终端验证](../validation/terminal.md)。不能把下面既有OMP/窗口安全检查当成终端已通过。

改动窗口、preload、IPC、内容展示或资源入口时，只检查实际受影响边界：

1. 先用行为负例证明越权来源、危险 URL/内容或归属错误被拒绝，正常请求仍成立。源码开关、库的默认清洗或依赖存在不足以单独证明行为安全。
2. 运行 `pnpm test tests/integration/window-security.integration.test.ts src/app/main/index.test.ts src/app/preload/index.test.ts`；文件/Git 变化再运行对应模块测试，协议/执行变化再运行 SDK 与收据回归。
3. 窗口加载或原生路径变化时，在隔离 App/OMP 环境执行 `node validation/security-window.mjs --development`、`node validation/security-window.mjs --development-untrusted` 和 `node validation/security-window.mjs <应用路径>`。涉及开发导航或重定向时，再用 `--development-redirect` 验证 302 的外域目标未被请求且回到内置页，用 `--development-local-redirect` 验证合法 loopback 302 仍能加载。外域 fixture 的主机解析被固定到隔离本地服务，不访问真实外站。这项检查使用真实 Electron、实际 preload/IPC 和浏览器 CSP；不启动项目 OMP，不借个人凭据。构建须先完成，包路径须指向本次候选产物。
4. 新增外链打开、嵌入网页、认证或 App 文件授权属于对应功能；重新核对来源/URL/权限及用户意图，不由本页预先授予。保留受限 preload 与外部内容的不同入口。

常规 `pnpm check` 包含窗口与既有边界回归；原生检查按影响运行，不加入快速 hook。只报告实际检查的构建和场景，不将 mock 回归称为真实 Electron，也不把原生入口检查写成用户已试用或全安全审计通过。
