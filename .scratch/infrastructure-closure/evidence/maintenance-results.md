# 维护与交付边界实施快照

2026-09-30。本页只保存本次实施/验证事实，任务状态由 [04 维护票](../issues/04-maintenance.md) 与 [规格](../spec.md) 维护。

## 实际修改

- 新增 [OMP 维护](../../../docs/engineering/omp-maintenance.md)、[桌面安全](../../../docs/engineering/desktop-security.md)、[本地交付](../../../docs/engineering/local-delivery.md) 三个主题入口。区分开发 skills、原生发现、固定资源和 App 数据；固定 SDK 的录制回放、真实 fixture 行为与随包验证分别说明；许可证、签名、公证、更新与公开发布的已有/未实施/待决定分别记录。
- Main 曾对打包/开发窗口无条件使用 `ELECTRON_RENDERER_URL`，外部页面可获得 preload。两个目标行为分别 [打包态红灯](window-security-packaged-red.txt)、[开发态红灯](window-security-development-red.txt) 后最小修复；打包只加载内置页面，开发仅接受无凭据 HTTP/HTTPS loopback。
- URL 兼容回归还暴露中间实现的 malformed URL 异常，[补修红灯](window-security-malformed-red.txt) 后使用有界解析失败返回，保留合法开发加载。无数据/实体/收据/队列行为变化。
- notices helper 曾删除生成节之后的 SDK/Bun 独立声明，并错误声明不随包开发依赖。[隔离 CLI 负例](license-notices-red.txt) 后仅替换生成节、保留其他上游声明；当前生产 UI 依赖图刷新为 193 项，未选择项目许可证。

## 工具链与自动化

初轮安全与 notices 运行实际为 Node 22.19.0：先前提供的 `/Users/lou/.nvm/.../v24.21.0` 路径不存在，PATH 回落默认 Node。保留原输出，不把这些运行记为固定环境。

后续显式执行 `/private/tmp/d-pi-rewrite-toolchain/node-v24.21.0-darwin-arm64/bin/node --version` 返回 `v24.21.0`，并用该目录前置 PATH：

| 检查 | 实际结果 |
| --- | --- |
| Main 类型 | [typecheck:main](maintenance-typecheck-node24.txt) 退出 0 |
| 窗口/Main/preload、SDK 录制回放及资源 | [28 项回归](maintenance-targeted-node24.txt) 通过；默认 CLI artifact smoke 明确 SKIP，本组未运行原生 CLI |
| notices CLI | [1 项行为回归](license-notices-node24.txt) 通过；Node 22 下的 [首轮绿灯](license-notices-green.txt) 保留 |
| 修改文件 Biome | `src/app/main/index.ts`、两个测试、`validation/s1/licenses.mjs` 和 `validation/security-window.mjs` 五文件检查退出 0 |

固定 SDK 的 `pnpm validate:sdk` 由工程子任务在真实 Node 24.21.0 下顺序运行并记录：[工程证据](engineering-results.md)。控制最终 idle/queued=0、同会话明确继续消费一次；失败检查保留同 request ID 的 ACK true 后 false，provider 调用为 0。维护子任务不重复采样或覆盖历史录制；最终入口/环境证据由工程票和规格整合。

## 真实 Electron 与隔离包

复用主 Agent 的 [build](build.txt)，没有重建或覆盖旧试用包。实际构建身份从 `out/main/index.js` 读取：源码 `e2b13e4bf67b37458df9d3cb7459ffb47a050c3d`、`dirty=true`、build ID `e2b13e4b-dirty-10a11d1f`。开发 Main artifact SHA-256 为 `93bfcd0f239a96f62eb49a8bcc4bcdaa178ff51b4375233c51b040c54620f2da`。

以 `pnpm exec electron-builder --mac --dir --config.directories.output=dist/infrastructure --config.electronDist=node_modules/electron/dist` 打包，退出 0，日志明确跳过签名（identity=null）并使用默认 Electron 图标。产物 `/Users/lou/Learn/d-pi/dist/infrastructure/mac-arm64/d-pi.app`；App asar SHA-256 `559e367db8554d0d63d419ec2b7f8b9675dfe3461acf9997c8b2c30d8324c05b`。

`validation/security-window.mjs` 使用 `createTestEnvironment`，分别隔离 App/OMP 配置、会话和 cwd，不继承凭据，不启动项目 OMP。真实浏览器验证受限 preload/IPC 正常、Renderer 无 Node/require、CSP 拒绝注入 inline script、window.open/页面导航拒绝：

- [开发态合法 loopback](window-security-development.json)：实际加载 HTTP fixture，原生 IPC restore=ready。
- [开发态不可信内容](window-security-development-untrusted.json)：data URL 被拒绝，实际加载本地 Renderer。
- [包内首轮](window-security-packaged.json)：即使继承合法 loopback URL 也不请求 fixture，实际加载 App asar 内 Renderer。以上三轮 harness 为 Node 22.19.0。
- [固定工具链包内复核](window-security-packaged-node24.json)：runner `v24.21.0`，实际浏览器 userAgent 报告 Electron 44.4.5；同一 asar 哈希和边界行为通过。该复核针对工具链记录错误，不重跑完整历史 GUI/故障矩阵。

验证结束主动终止没有原生工作的新窗口进程并清理临时目录；不把验证清理称为用户正常退出/队列策略验收。

## SDK 随包文件与未关闭事项

[资源文件复核](sdk-package-files.json) 使用真实 Node 24.21.0 检查候选包：`inspectSdk` 0 issues，176 个包的 name/version 与准备资源一致，154 份已存在根级声明逐字相同，Bun 原始说明逐字相同。没有执行未知资源，也没有升级 SDK。

[当前资源盘点](sdk-license-inventory.json)记录 176 个包单元，152 个有根级 LICENSE/COPYING/NOTICE；24 个包目录内没有名称包含 license/copying/notice 的文件（libvips、puppeteer、onnxruntime、sherpa 等）。不跟随 symlink、不由此推断上游无许可或分发义务已满足。公开分发前按实际产物处理来源/声明核对；该缺口不阻塞内部工程收口或独立 S5 规划。

项目许可证、公开分发范围与版本序列待权利人/产品决定；签名公证、自动更新和正式分发入口未实施。真实供应商/个人扩展、系统输入法、其他平台及冷恢复执行全周期单写未由本组验证。S3 放弃队列后正常退出出口继续待决，本轮不改变策略，不开启 S5/M2、不 push 或公开发布。
