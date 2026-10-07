# 设置页与配置组件

## 推进与交接

2026-10-07 用户明确授权：按四张截图风格做好设置页，先拆名称、职责、类型/API，再实现，遵循现有规范并参考 UI 库。基点为 main；实施分支 codex/settings-ui，独立 worktree settings-ui/d-pi。范围为已有设置项与实际所需共享组件；不新增截图产品的权限、记忆、字体、快捷键编辑等业务。重要待决：无。D-17/D-32/D-35/D-37 和唯一紧凑布局保持。工程接入、完整检查与独立两轴评审完成，已交付 Dev 待试用，用户认可 pending。见 [交接](handoff.md)、[验证](validation.md)、[评审](review.md)。

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

01/02 工程完成；完整检查836项通过、2项条件跳过，构建及8项隔离 Electron 场景通过，6张画面已核实。独立 Spec/Standards 无实质发现，过渡中截图已刷新并由 reviewer 复核。组件看板收录新控件组合，沿用原 catalog 搜索与重置。普通 CSS 间距消费 Tailwind `--spacing`。生产实现 d02201c，验证补充 b0a7ab6；Dev 交付，用户反馈待收。

```project-status
[{"id":"settings-ui","title":"设置页与配置组件","phase":"基建","engineering":"complete","trial":"delivered","acceptance":"pending","build":"Dev / codex/settings-ui / d02201c + b0a7ab6","evidence":["handoff.md","validation.md","review.md"],"next":"等待设置页 Dev 试用反馈"}]
```
