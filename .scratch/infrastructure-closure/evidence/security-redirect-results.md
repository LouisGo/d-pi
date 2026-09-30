# 开发窗口 HTTP 重定向修复

本记录是冻结后独立审阅发现的缺口及修复证据；[初次维护快照](maintenance-results.md) 保留原貌，不将旧构建的原生结果当作本次修复的验证。

## 缺口与行为修复

审阅者以真实 Electron 从允许的 `http://127.0.0.1` 入口响应 302 到外域 HTTPS，外域仍收到 `desktop` preload，并成功调用 locale 与 restore。`will-navigate` 没有覆盖服务端重定向。[原始复现原样副本](security-redirect-review-red.json) 来自 `/private/tmp/d-pi-engineering-review-redirect-MqgoDw/https-redirect-proof.json`；旧 `out/main/index.js` SHA-256 为 `93bfcd0f239a96f62eb49a8bcc4bcdaa178ff51b4375233c51b040c54620f2da`，runner Node 为 `v24.21.0`。

[Main](../../../src/app/main/index.ts) 在发起加载前注册 `will-redirect`，沿用初始开发 URL 的同一 schema 检查 HTTP/HTTPS、loopback 主机与无凭据边界。打包态拒绝重定向，开发态拒绝外域及危险目标；合法本地重定向保持可用。开发加载被取消或拒绝后，当前窗口回到内置 Renderer；关闭后的旧窗口不再加载，内置加载若失败则记录现有 `window/failed` 诊断，Promise 拒绝受到处理。

## 红绿与本地检查

执行 runner 为 `/private/tmp/d-pi-rewrite-toolchain/node-v24.21.0-darwin-arm64/bin/node`，实际版本 `v24.21.0`。未升级 Electron 或固定 SDK，未启动 OMP 会话。

| 检查 | 结果与证据 |
| --- | --- |
| 重定向 TDD 红灯 | [原始输出](window-security-redirect-red.txt)：新增外域重定向测试失败，`preventDefault` 为 0；原 11 项通过。 |
| 最小修复绿灯 | [原始输出](window-security-redirect-green.txt)：窗口 12 项通过。 |
| 扩展回归 | [原始输出](window-security-redirect-targeted.txt)：窗口 22 + Main 7 + preload 7，共 36 项通过，无未处理错误。覆盖拒绝时机、危险 URL、本地 HTTP/HTTPS/IPv6 重定向、取消后回退、窗口关闭和回退加载失败。 |
| 类型边界 | [原始输出](window-security-redirect-typecheck.txt)：完整 `pnpm typecheck` 通过。 |
| 静态与格式 | [原始输出](window-security-redirect-biome.txt)：Main、窗口回归与原生 harness 共 3 文件通过。 |
| 文档引用 | [原始输出](window-security-redirect-docs.txt)：`pnpm check:documentation` 通过（155 个现行 Markdown；17 个历史快照排除）。 |

## 本次构建的定向原生验证

使用主 Agent 在真实 Node `v24.21.0` 下完成的 [最终构建](final-build.txt)，未重建旧产物，也未重复 SDK、普通启动或性能评测。`out/main/index.js` 内嵌身份为 commit `3285474e5c6a37b72a36337d870fd2f27c2f63cb`、`dirty=true`、build ID `3285474e-dirty-1f488792`；Main SHA-256 为 `6c3a7c2fd36fa9069fb5d2c606b98859bd158eed766b87a11404699ff8e24e9a`。

两个模式串行各执行一次，runner Node `v24.21.0`，浏览器实际版本 Electron `44.4.5`，进程均退出 0：

| 场景 | 观测与证据 |
| --- | --- |
| `--development-redirect` | [JSON](window-security-redirect-native.json)、[原始输出](window-security-redirect-native.txt)：允许的 loopback 入口 302 到外域 fixture，只有 `/external-redirect` 被请求，外域请求为 0；窗口回到内置 `file:///…/out/renderer/index.html`，locale 成功、restore 为 ready。 |
| `--development-local-redirect` | [JSON](window-security-local-redirect-native.json)、[原始输出](window-security-local-redirect-native.txt)：`/local-redirect` 302 到同一 loopback `/index.html`，随后脚本与样式加载，页面和 IPC 正常。 |

两种场景均验证 renderer 的 Node/require 不可用、注入 inline script 被 CSP 拒绝、页面新窗口与外部导航被阻止，隔离 sessions 目录为空。外域 fixture 的解析只指向隔离本地服务，不访问真实外站。原 HTTPS 外域绕过的独立复核由主 Agent 协调，此处仅记录上述已运行场景；打包候选复核由主 Agent 单独记录。

## 限制

这是特权窗口入口的具体修复及定向回归，不能推断完整安全审计、用户试用或公开发布完成。S3 退出队列待决、运行权限、SDK 合同及产品行为不在该修复范围内。
