# 设置页与配置组件

## 推进与交接

2026-10-07 用户明确授权：按四张截图风格做好设置页，先拆名称、职责、类型/API，再实现，遵循现有规范并参考 UI 库。基点为 main；实施分支 codex/settings-ui，独立 worktree settings-ui/d-pi。范围为已有设置项与实际所需共享组件；不新增截图产品的权限、记忆、字体、快捷键编辑等业务。重要待决：无。D-17/D-32/D-35/D-37 和唯一紧凑布局保持。工程接入与隔离 Electron 场景完成，整段检查与评审进行中；用户认可 pending。

## 设计与组件合同（实现前固定）

Operate，继承截图的分类导航、大标题、分组边框、内部分隔、说明与右侧控件；共享 token、light/dark、系统字体。设置仍在现有大 Modal；窄窗导航横向滚动，配置行自然换行。分类为外观、通用、配置与认证、提醒、诊断。截图是视觉依据，不是新增产品能力清单。

| 名称 / 类型 | 职责 | 自有 API |
| --- | --- | --- |
| Button / 基础 | 同一变体与交互，迁移现有实现至 ui/renderer | DOM button props; variant default/secondary/ghost/navigation; size default/icon/status |
| Select / 基础 | Base UI 选择、键盘与 portal，选项与值类型一致 | value:T; options:readonly {value:T,label:string}[]; onValueChange(T); id; disabled; aria-label/describedby |
| Switch / 基础 | Base UI 开关，受控布尔意图 | checked:boolean; onCheckedChange(boolean); id; disabled; aria-label/describedby; data-* |
| TextInput / 基础 | 统一输入边框、焦点、禁用 | DOM input props |
| FormField / 表单 | 自动关联 label、description/error 与 input | label:string; description?:ReactNode; error?:string; children({id,describedBy,invalid}) |
| SettingsPage / 布局 | 页面 heading、description、内容间距 | id; title:string; description?:string; children; hidden?:boolean |
| SettingsGroup / 配套 | 分组标题、边框与行分隔 | title?:string; description?:string; children |
| SettingRow / 配套 | 左侧 label/description，右侧控件 | label:string; description?:ReactNode; htmlFor?:string; children |
| ChoiceGroup / 基础组合 | Base UI RadioGroup 的受控选择，支持视觉预览 | value:T; options:readonly {value:T,label:string,preview?:ReactNode}[]; onValueChange(T); disabled; aria-label |
| ThemePreview / 外观业务视图 | 纯 CSS 模拟应用的浅/深/系统布局，不负责持久化 | mode:Preferences['theme'] |
| SettingsNavigation / App组合 | 分类选中、aria-current 与页面选择 | Settings context，仅局部状态；不订阅工作区 |

ui/renderer/public.ts 是跨模块公开面，无 IPC/store/i18n 依赖；文案从业务传入。Button 原实现移动，消费者直接改接公开面，Icon Layer 不迁移。configuration 业务持有认证 hook 与 Query；page 模式提供展开内容，active 只控制只读查询，不取消认证。各页保持挂载并 hidden，页面切换不释放后台模型。AppModel.preference 增加显式目标值并沿用串行写 lane；旧循环入口保持。状态以持久回读为准，失败保留旧偏好并在设置显示。

```implementation-plan
[{"id":"settings-ui","tickets":["01","02"]}]
```

## 验收

类型/设计/i18n/架构与受影响行为检查；覆盖直接主题选择、disabled、选项键盘/焦点、label关联、切页认证续步、通知保存；设置实际 light/dark 和窄窗视觉检查。自动化和 Agent GUI 观察不代表用户认可。

## 本轮进度

01 共享控件工程完成；02 页面接入、42项受影响行为与6张隔离 Electron 画面已通过，正在整段检查/评审。组件看板收录 Select、Switch、FormField/TextInput、ChoiceGroup、SettingsGroup/SettingRow/SettingsPage，沿用原 catalog 搜索与重置。普通 CSS 间距使用 Tailwind `--spacing`，不复制独立标尺。

```project-status
[{"id":"settings-ui","title":"设置页与配置组件","phase":"基建","engineering":"in-progress","trial":"not-delivered","acceptance":"pending","evidence":["spec.md"],"next":"完成组合检查与独立两轴评审，交付 Dev 试用"}]
```
