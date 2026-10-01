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

## 生成与验证

Router 1.170.41、plugin 1.168.42、CLI 1.167.40 精确锁定；CLI/plugin 版本各自发布，不要求数字相同。`tsr.config.json` 是生成配置的单源；electron-vite 的插件仅位于 Renderer 并在 React 插件之前，启用自动拆包。`pnpm typecheck`、`pnpm test` 在运行前生成路由树；`pnpm build` 的插件亦可从干净源码生成。

架构门禁禁止 Router 运行时从非 Renderer 导入。生成文件仅豁免 Biome 的格式/静态规范，由生成器、类型检查与架构扫描覆盖。验证入口包括导航编译反例、实际 Router 与 AppModel 行为、编辑连续性、完整工程检查及隔离数据的打包 Electron 导航；工程通过与用户试用认可分别记录。
