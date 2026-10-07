# 选择组件验证与交接

日期：2026-10-07。隔离 worktree：`codex/selection-components`，基点 `598323321c8c2ba6eb177097e2042510c3b79d87`。

已完成：公共 Select 默认bottom并关闭触发器重叠、二值ChoiceGroup胶囊、主题改Select/发送键改ChoiceGroup、模型与子Agent模型弹层内搜索、原生select迁移、诊断FormData与模型意图保持、组件看板示例和设计约定同步。

## 已运行的证据（最后补充修改之前）

- 7个相关文件45项行为测试通过，覆盖UI、模型/子Agent真实RuntimeModel、诊断筛选与历史/看板。
- `tsc --noEmit -p tsconfig.renderer.json`、Biome、设计lint、国际化检查、文档引用、架构边界通过；结构报告重新生成。
- Electron-vite build成功。现有依赖注释及大chunk提示不影响构建；未打包或向远端发布。
- [选择控件Electron](evidence/native.json)：6组light/dark几何、bottom/边缘top、触发器不重叠、弹层搜索、键盘选择、无结果、Esc返回焦点、radio方向键及400px窄窗；9张截图。
- [真实设置页隔离Electron](evidence/settings.json)：主题保存、语言select Portal/键盘Esc、通知保存、窄窗边界、Thread资源与Modal焦点；6张截图。
- Impeccable机械检查无发现；查看light搜索与dark窄窗图片。全部使用隔离测试环境，无真实供应商/认证请求。
- TDD搜索功能先失败（缺搜索输入），再实现通过。模型与子Agent能力变化回归识别控件隐藏输入自动替换失效意图，修复后15项通过。

## 用户最后补充：只改代码，不重复验证

搜索框左侧加入统一SearchIcon，使用共享主题颜色；搜索行改为图示的下划线样式，Popup通过`initialFocus`显式聚焦输入ref，打开即可输入。图标实现置于UI的Icon Layer，App图标具名出口复用该公开面，UI不反向依赖App。同步现有验证脚本选择器与清理旧样式，未重跑测试、GUI、构建或检查。因此上述通过证据对应补充修改之前，截图不包含最后新增SearchIcon。

用户2026-10-07授权本地PR到main；已将`codex/selection-components`合入本地main，合并提交`abaea1316d4f45daaf145c139a9e1cee59a934af`，保留main上的终端B文档提交。未push、未创建远端PR；用户认可pending。

## 存量组件 outline 修正（用户后续要求）

已修改全局 interaction.css 和 Button/Select/TextInput/Switch/ChoiceGroup 现有默认样式：非focus-visible及指针来源一律不显示outline。共享监听器在正式入口安装，并接入隔离Renderer入口；Tab/方向键/键盘激活及独立焦点移动释放指针标记。更新AGENTS与设计合同，取代历史一律无outline描述。按用户要求只改代码，未运行检查、测试、GUI或构建，本轮效果尚未实测。
