# 最小 Electron 随包 OMP 验证

日期：2026-09-24。结论：**最小随包运行链路通过，当前可行性验证可以收束，进入需求讨论与技术选型。** 没有建设前端基建、正式 Settings、多会话界面或修改生产启动逻辑。

## 范围与实际结果

环境：macOS arm64；Electron **44.4.5**，沿用清理前原型的实验版本，不约束后续技术选型；官方独立 OMP **18.3.0**。

使用 Electron 官方发行 ZIP 组装一个最小 `.app`：脚本位于 `Contents/Resources/app`，OMP 位于 `Contents/Resources/runtime/omp`。更名可执行文件并同步 `CFBundleExecutable` 后，将完整应用移动到含空格的新目录，经 `open -n -W`（macOS LaunchServices）启动，不用开发服务器或项目路径启动 Electron。

| 检查 | 结果 |
| --- | --- |
| 真正从应用包启动 | `app.isPackaged === true`，主进程路径位于 `.app/Contents/MacOS/OMP Bundle Probe`。 |
| 资源路径与内置 Runtime | 根据 `process.resourcesPath` 定位 OMP；移位后路径正确。OMP 子进程 PATH 仅 `/usr/bin:/bin`，实际版本为 18.3.0。 |
| 跨进程协议往返 | 包内 preload 的 MessagePort → utility SessionHost → 包内 OMP；Renderer 收到 ready，RPC v2 协商及 get_state 成功。 |
| 真实 Runtime 回合 | OMP 请求 localhost 固定模型，Renderer 收到 `BUNDLED_OMP_OK` 的助手消息及终态。不是仅执行 `--version`。 |
| 退出 | OMP 和 Host 正常以 0 退出；LaunchServices 启动结束后检查 Main/Host/OMP PID 均已不存在。 |

[机器结果](../../.scratch/omp-runtime-feasibility/packaged-result.json)记录实际路径、版本、哈希、PID 和退出结果。隐藏 Renderer 只用于自动验证消息往返，不含产品 UI。

## 复现

脚本只使用 Node 内置模块和 macOS 系统命令，无需安装本仓库依赖：

```sh
node .scratch/omp-runtime-feasibility/packaged/run.cjs \
  /absolute/path/electron-v44.4.5-darwin-arm64.zip \
  /absolute/path/omp \
  /tmp/d-pi-packaged-result.json
```

- [Electron 44.4.5 发行页](https://github.com/electron/electron/releases/tag/v44.4.5)：使用 `electron-v44.4.5-darwin-arm64.zip`；SHA-256 `a212eee63ba2f45fd83bd28f77a3e3313a336ad17a4c25adf617942eef5e0e2c`，已与官方 `SHASUMS256.txt` 核对。
- [OMP 18.3.0 发行页](https://github.com/can1357/oh-my-pi/releases/tag/v18.3.0)：使用 `omp-darwin-arm64`；SHA-256 `d61fb411f24146bed48dd901b13b5912a297d899ee691dda69c4b5b7ab8c35dc`，已与官方 `SHA256SUMS.txt` 核对。
- [组装和启动脚本](../../.scratch/omp-runtime-feasibility/packaged/run.cjs)、[Main 探针](../../.scratch/omp-runtime-feasibility/packaged/main.cjs)、[utility Host](../../.scratch/omp-runtime-feasibility/packaged/host.cjs)、[preload](../../.scratch/omp-runtime-feasibility/packaged/preload.cjs)。默认输出仓库内 `packaged-result.json`，显式传第三参数可避免改写已存证据。
- 临时 `.app` 和测试目录不提交。配置和会话在临时目录中，使用 localhost 模型，不读取个人提供商凭据；这只是测试隔离，不改变 [共享原生配置决策](../adr/0002-share-native-omp-config.md)。

首轮探针保留了默认 `Electron` 可执行文件名，`app.isPackaged` 为 false，因此未被接受。按打包应用命名方式更名可执行文件及 plist 后重新运行，所有断言通过；最终机器结果来自修正后的运行，没有绕过 packaged 断言。

## 不覆盖的事项

- 使用 `Resources/app` 明文目录，没有验证 ASAR、electron-builder 的正式资源配置或产品 GUI。
- 经 LaunchServices 启动，不声称已经手动点击 Finder；没有验证 Gatekeeper、签名、公证、安装器及首次下载体验。
- 开发机器上的 macOS arm64 实验，不是干净机器、Intel、Windows 或 Linux 兼容认证。
- 模型为 localhost 固定响应，没有验证真实供应商认证、模型理解质量或 UI 流畅度。
- 早期依赖外部 OMP 的应用实现已移除。本次证明随包方案可行，仓库目前没有产品级实现。

## 本阶段收束与提交条件

可行性验证提交 `6fab3ef` 前已复跑并通过：

1. [核心能力探针](../../.scratch/omp-runtime-feasibility/result.json)：9 项。
2. [Settings 补测](../../.scratch/omp-runtime-feasibility/settings-result.json)：6 项。
3. 本次随包探针：4 项汇总检查，涵盖上表链路与退出。
4. 实验脚本语法、文档本地链接及 `git diff --check`；进程退出结果检查。

这些是三个限定范围的可行性实验，不是 19 项正式产品验收。未改生产源码或项目依赖，因此不以未运行的应用类型检查/组件测试冒充此次验证。

下一步等待用户的需求讨论与技术选型，不自动建设 UI、调整前端状态管理、增加复杂子 Agent 控制或扩大 Runtime 适配层。
