# 应用导航（D-38）

2026-10-01。范围与交付状态见[路由规格](../../.scratch/router-integration/spec.md)。

## 归属与类型

导航属于 `src/app/renderer` 的应用装配，不新增领域模块。`routes/` 是文件路由，`routing/` 是 Router、memory history、导航接入及 search 校验。`route-tree.gen.ts` 由官方工具生成，禁止手改；`Register.router` 关联实际 Router 类型。运行时不得进入 Main/Host/preload/core/contracts。

所有生产 `navigate`/Link 消费注册树：目标、params、search 由库推导，禁用 authored `as`/`any`、宽泛字符串入口或重复参数映射。现有 `ThreadIdSchema` 解析 params，Zod schema 推导阅读页签；未识别的页签回退 conversation。编译期正反例在 `validation/router/navigation.ts`，由完整 typecheck 覆盖。官方生成文件的内部断言不复制到业务代码。

根路径 `/` 展示启动状态或无 Thread 工作台。`/threads/$threadId` 展示真实选中 Thread，`view` search 表达 conversation/files/submissions/history。阅读页签 replace，切换 Thread push，启动恢复 replace；外部深链接及新设置页面不在当前范围。

## 选择确认与生命周期

Main 保存 Thread 选择，AppModel 拥有 ThreadModel 及编辑/运行/提交资源。路由只是位置投影，不以页面挂载创建或销毁业务资源。点击、后退、前进均经过同一应用导航检查：冻结输入、flush 旧草稿、Main 选择确认、发布完整资源，随后才提交 history。IME/保存失败/取消/关闭预约不提交导航。

选择回包失败不能证明 Main 未改变选择。AppModel 只读 restore 核对，不自动重发选择命令；无法核实时保留 unknown、冻结相关交互，用户通过明确核对入口再读取。迟到结果受模型代次保护。路由显示前同时核对 route params 与模型的真实身份，不能把 B 的资源绘制在 A 的页面。Main 已确认 B、Router 仍呈现 A 时，保留最近一次匹配 A 的视图引用并使工作区 inert/aria-busy，身份对齐后一次替换；这是只读呈现引用，不是可写选择或另一份资源所有者。选择 unknown 或 App 已失效时撤下工作区，不保留可操作旧视图。

`createDesktopHistory` 只对已提交的 memory history 投影保存 POP 目标，准入前不修改真实历史。锁定 `@tanstack/history` 1.162.4 的默认 memory history 不阻止 POP，故应用在 PUSH/REPLACE/BACK/FORWARD/GO 的共同入口检查；拒绝时保持当前位置及前进历史，并完成 Router 的导航等待。Router commitLocation 接入保留原推断签名，涵盖 SDK 同位置直接 load 的快捷分支；在途 history 的完成 barrier 防止旧 load 提前结束新导航等待，守卫释放后重新同步 Main 已确认的身份。

Router 不在 beforeLoad/loader/preload 执行选择、保存、启动、发送、停止等命令。新建 Thread、选项目等命令仍由 AppModel 发起，完成后导航到真实身份。同 Thread search 切换保留工作台、Composer 与四个阅读面板挂载，延续 DOM 滚动、编辑撤销、待应用附件及 Query 缓存。每 Thread 的阅读坐标归应用 ThreadModel，仅在本 Renderer 生命周期内恢复，切换不共享坐标，也不复制 OMP 历史正文。Query 的 scope/key、只读重试政策沿用原合同。

## 开发者工具路由（2026-10-07）

用户授权新增 `/dev/components`，展示已开发基础组件的分类、真实形态和交互，2026-10-09 用户明确将开发者区域纳入双语改写，取代固定中文；入口、路由标题、说明及示例跟随应用语言，技术名称保留。Thread列表底部右侧的工具菜单悬停、点击或键盘打开，当前仅组件看板；后续工具按实际授权加入。注册路由通过 `staticData.workspace="developer"` 与类型化 `titleMessage` 声明独立工具工作区，覆盖中层的Thread列表及内容区，共享全局native顶栏/后退前进/主题和底部状态栏，不显示Thread标题、通知正文或辅助宿主。退出恢复原工作台布局意图，路由元信息不改变布局持久状态。

工具页没有 Thread 选择或执行副作用。进入前由 AppModel 的 `prepareViewNavigation` 核对可操作状态、冻结编辑、flush 草稿并释放本次冻结；IME、保存失败、未完成或待处理失败的附件/引用输入、关闭预约或资源代次变化拒绝导航；附件准入使用同步请求计数与 Thread 归属的导入状态，在 flush 前后检查，保留完成后的插入和显式失败处理。页面卸载只释放视图资源，原 ThreadModel 继续存活。无关模型通知保持工具路由，明确新建/选择了另一 Thread 时重新同步真实身份。工具页可通过顶栏“返回会话”及后退/前进回到会话，沿用已有编辑状态捕获和恢复。

## 生成与验证

Router 1.170.41、plugin 1.168.42、CLI 1.167.40 精确锁定；CLI/plugin 版本各自发布，不要求数字相同。`tsr.config.json` 是生成配置的单源；electron-vite 的插件仅位于 Renderer 并在 React 插件之前，启用自动拆包。`pnpm typecheck`、`pnpm test` 在运行前生成路由树；`pnpm build` 的插件亦可从干净源码生成。

架构门禁禁止 Router 运行时从非 Renderer 导入。生成文件仅豁免 Biome 的格式/静态规范，由生成器、类型检查与架构扫描覆盖。验证入口包括导航编译反例、实际 Router 与 AppModel 行为、编辑连续性、完整工程检查及隔离数据的打包 Electron 导航；工程通过与用户试用认可分别记录。

## Thread 提醒定位（M2）

Main 的 attention snapshot 是提醒状态单源；AppModel 持有 Renderer 镜像及释放，视图只订阅相关 Thread 实体。提醒采样不创建/重启 Thread 资源，正常完成默认仅更新侧栏完成/未读。系统提醒和完成提醒分别显式开启；系统支持不等于已授权或送达，系统不可用/失败时保留应用内状态。

应用内与原生提醒点击共用现有 Router 准入。IME、保存或并发导航阻止切换时保留可重试操作，不强切或吞掉意图；原生 openRequest 在尝试后确认消费，阻止无限重放。过期点击仍打开当前 Thread，并按抵达后的当前事件选择阅读页签，不发送旧回答。待回答定位当前交互；失败进入提交结果，只有匹配当前 trace 的可得收据才展开并聚焦；缺少匹配收据时定位当前运行状态。已读仅在窗口实际聚焦、路由与已确认 Thread 对齐后提交 seen，侧栏显示或通知显示均不代表已读。


2026-10-07布局修订移除一级竖栏：Home的设置/开发入口固定在Thread列表底部；开发者工作区保持全宽内容，顶栏“返回会话”复用原Thread导航意图，不需要Home图标。布局隐藏不销毁Thread模型或改写手动偏好；见[设计合同](design-system.md)。
