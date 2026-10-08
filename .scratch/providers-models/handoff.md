# Provider 与 Models 本地交付

初次交付源码：`/Users/lou/.codex/worktrees/providers-models/d-pi`；分支 `codex/providers-models`，从本地 main `f649457d063f7ab8abfb82a1ba63031cbce9fe77` 建立。固定 OMP 18.4.6、macOS arm64。后续用户追加授权本地 PR 合入 main 并 push，最新身份见 [合入记录](local-merge.md)。

## 试用

已完成本地 PR 合入 main 并 push，原目录 main 的固定 SDK、环境和快速检查通过。日常试用从原项目目录运行 `pnpm dev`，此机精确工具路径可用：

```sh
cd /Users/lou/Learn/d-pi
PATH="/tmp/dpi-composer-node:/tmp/dpi-composer-tools:$PATH" pnpm dev
```

Dev 使用按 checkout 分开的 App 数据，OMP 配置沿用用户原生共享目录；GUI 验证使用的是独立临时 HOME/App DB，不是个人账户或日常数据。

1. 设置 → 服务商与模型：选择当前项目或全局作用域，管理 Provider 原生登录、API key、多账户断开、启用与刷新。配置来源可展开查看，外部变化导致冲突时保留草稿。
2. Provider 的模型区：搜索能力目录，管理收藏、显示/隐藏与排序；添加/编辑/删除自定义模型，设置全局或项目角色。设备偏好不会改变原生 provider 的执行能力。
3. Composer 模型按钮：按服务商或收藏筛选、搜索并切换；推理档位来自实际原生能力，Default/off/effort 分开。当前 Thread 切换等待 Host 回读，不改共享默认；忙碌或不可执行时准确限制写操作。

## 证据与边界

实现、验证和失败修正见 [validation](validation.md)、两轴结论见 [review](review.md)、本地 PR 草稿见 [pr](pr.md)。真实流程使用 `22569b7` Main；最后视觉修正只重编译 `048d498d` Renderer。完整 build ID、组件/SDK SHA 和结果由 [gui-flow](evidence/gui-flow.json) 与 [Renderer build](evidence/renderer-polish-build.json) 记录；后续交付记录提交不冒称重新编译应用。

工程与必要 GUI 确认完成，Dev 已交付待试用，本地 PR 已合入 main 并 push；用户认可仍 pending。真实供应商 OAuth/API 服务、个人账户、计费请求、远端 CI、打包签名和公证均未验证。合并没有新增 GUI 或真实供应商验证。

截图：[Provider 浅色](evidence/providers-light-confirmed.png)、[模型管理](evidence/provider-models-light-confirmed.png)、[Composer panel 深色](evidence/picker-dark-confirmed.png)、[Kimi 浅色](evidence/providers-kimi-light-polished.png)、[窄布局](evidence/providers-kimi-narrow-polished.png)、[实际本机响应](evidence/local-native-response.png)。
