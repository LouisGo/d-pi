# M2 渲染边界与新会话启动反馈

2026-10-01。用户补充 m2.10 反馈：Thread、主题、语言、发送快捷键切换都出现大范围 React 更新，所有按钮都会更新；必要更新可以接受，视图闪烁不能接受。用户随后明确拒绝 Busy 时修改样式或干扰正常操作，并要求新 Thread 无须再次手动启动 OMP。本轮接续此明确授权，用户认可仍 pending。

## 根因与修复

- 共享 Button/Base UI 1.8.0 没有订阅全局偏好。实际传播来自 AppModel 偏好保存发布全局 busy、ProjectThreads 父级订阅整个 selected/busy，以及 ReadyWorkbench/ThreadWorkbench 根层消费语言/选择状态。按钮的 disabled 反复变化触发既有 opacity，使整个导航瞬间变灰；只给 Button 添加 pending 样式既不能解决状态传播，也会继续干扰操作。该临时补丁已完全撤回，Button 和 disabled 样式保持原实现。
- 偏好保存改为独立串行写入，不占用 Thread 交接的 busy/requestGeneration；保存期间正常控件可用，连续偏好不丢字段。迟到保存回执应用到当前 App，导航回执不覆盖更新后的偏好；保存失败不清除正在进行的 Thread 交接。
- 交接保护由稳定 ShellFrame 承载；语言订阅下沉到实际文案节点；侧栏 Thread 行分别订阅自己的 selected 布尔值，稳定字段经 memo 阻断列表刷新传播。Thread 内容和阅读解析有稳定边界；Markdown 的组件类型、插件引用固定，只有图片替代文案订阅翻译。翻译 Context 与语言偏好/保存状态分开，相同 resolvedLocale 不再次通知全部翻译消费者。
- 新 Thread/打开项目产生新 Thread 后，由应用拥有的 ThreadModel 等待 inspect，只有已 trusted 且 allowed 才自动 start。首次用户明确允许项目执行后，RuntimeModel 顺序启动，无第二次点击。恢复旧 Thread 不自动启动，不替用户授予项目权限；OMP/Main/SessionHost 的执行所有权保持。

## 验证

真实 App/Router/Zustand 挂载的失败回归覆盖侧栏无关行执行、语言更新传播和迟到保存回执；自动启动先验证缺口失败，再验证一次启动与未授权不启动。完整行为测试 500 通过、1 项既有 CLI artifact opt-in 跳过；六个类型入口通过。Biome、设计/i18n lint、设计约束、架构扫描及 33 架构测试通过。Impeccable 按 optimize 范围核对，机械检测无本轮发现；不纳入整页重设计。

原生 Electron 44.4.5 使用真实 App/Router/Zustand/Tiptap/Streamdown/Base UI，隔离桥接延迟 120ms；配置/模型区展开，三个 Thread 及长 Markdown 已加载。六场景（主题、发送快捷键、密度、语言、Thread、新 Thread）通过，共 137 个 DOM mutation/requestAnimationFrame 样本：[采样](evidence/rendering-native.json)、[实际窗口](evidence/rendering-native.png)。偏好/语言切换的原有按钮、编辑器和已高亮正文保持身份，没有瞬间禁用/opacity 改变；Thread 切换公共壳持续存在，工作区始终有几何；新增历史后的“后退”正常变可用，不误算成闪烁。新 Thread 就绪且只发一次 start。

采样前等待 Shiki 完成首次高亮，避免将首次异步代码块加载误归因于发送快捷键。早期源码 HMR 和无效 ThreadContext fixture 均导致验证失败，分别关闭 fixture HMR、按真实合同修正 fixture；未据失败声称工程完成。渲染次数与这些代表性连续性检查不构成全负载视觉验收，真实供应商及用户体验待用户复试。

`pnpm check:fast` 在现有 `DEP-LOCK-FORMAT` 工具环境检查失败（Node/pnpm 版本及 46/46 精确依赖吻合，工具无法解析当前锁文件）；未修改锁文件或降低门禁。其后的相关检查独立运行并报告真实结果。本次 build 使用独立输出目录，避免覆盖正在使用的 `pnpm dev` 产物。

实际工作树验证包 `14952d69-dirty-e5b755c1`（dirty=true，源码基线 `14952d69`）通过 15 项隔离 Main/SessionHost/OMP 检查：明确项目授权接续启动、新 Thread 自动启动、两个 OMP scope 并行、独立草稿/选区/撤销、Thread/页签/back-forward 连续性与阅读坐标、刷新不重发，以及冷旧会话只读。冷恢复后新建的第三条原生会话也自动就绪；全部只有两次 localhost fixture 生成请求。见 [结果](evidence/rendering-package-result.json)、[原始运行](evidence/rendering-packaged.txt)、[新 Thread 窗口](evidence/rendering-m2-cold-new-thread.png)。app.asar SHA-256：`e64b1ecae128914c3cd3910002af559e25ce88ce7da96e81df12f827b2ed5c6e`。

这是真实原生链路的工作树验证包，不冒称 clean 发布候选。当前源码用于 `pnpm dev` 复试，未替换历史已交付包。生产构建通过（既有 Zod 注释及大 chunk 提示保留）；初次验证打包因临时目录的 macOS 路径别名、显式 FileSet 缺少 package.json 失败，改为独立工作区构建副本与显式 metadata 后通过，未改生产打包配置。工程通过不替代用户认可，历史 m2.10 证据仍保留。

## 2026-10-01 门禁解析补修与 push 授权

用户随后明确要求优雅修复 `check:fast` 的解析阻塞，并完整 commit/push；该直接授权取代本轮先前的“不 push”限制，未扩展为公开发布或用户体验认可。当前远端 `origin/main` 无分叉，已有七个本地提交包含导航、开发工具、Impeccable 和本轮渲染修复，均纳入本次正常 fast-forward push。

根因：pnpm 12 的独立包管理器 YAML 文档同时记录 `pnpm` 与 `@pnpm/exe`，此前单一正则只接受 `pnpm` 一个条目。复用同一个按结构读取 root importer 的函数来读取两份文档，明确分开应用依赖与包管理器依赖；管理器只接受 pnpm 与可选的 @pnpm/exe，specifier/实际版本必须与 package.json 的 packageManager 相同。应用锁 specifier、peer-qualified resolution、重复/多文档/未知结构仍严格检查。未增加依赖、删除锁文档、放宽门禁或改动锁文件。

用实际 pnpm 输出的 manager 文档新增回归，先在原解析器失败，再通过；同时验证 manager 不会遮盖应用锁漂移，拒绝未知 manager 和 manager 版本漂移。11 项 dependency-gate 回归通过：[失败](evidence/lock-parser-red.txt)、[修复后](evidence/lock-parser-green.txt)。当前 `pnpm check:fast` 全链通过：[结果](evidence/lock-parser-check-fast.txt)。完整 `pnpm check`（500 行为测试、33 架构测试、49 tooling 测试通过；1 项既有 native opt-in 跳过）与 `pnpm build` 通过：[完整检查](evidence/lock-parser-check.txt)、[构建](evidence/lock-parser-build.txt)。原工作区在检查期间出现并行视觉任务的临时文件及未完成格式改动，故最终完整检查冻结 `eaf29c9` 加本轮解析/文档修改，在托管隔离 checkout 内使用 Node 24.21.0、pnpm 12.8.1 与独立 COW 依赖执行；未回滚或纳入另一个任务的进行中改动。本轮实际被提交/推送的源码与该验证范围一致，未关闭任何检查。后续普通 fast-forward push 包含已完成本地提交；最终远端提交身份由 push 后 Git ref 核对确认。
