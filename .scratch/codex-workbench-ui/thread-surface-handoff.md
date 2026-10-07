# Thread 主区基础布局交接

日期：2026-10-07；实施源 `6202f2eb2ef81d185646fd49457191284133083a`；基点 `56f0b0a`；分支 `codex/thread-layout`。本轮是基础布局收纳，工程完成与用户认可分开。

## 交付

- 上方消息区独立滚动，下方 Composer 停靠；内容同宽居中，窄窗不横向溢出，长稿最多占工作区60%，展开编辑保留原行为。
- 目录、模型/子 Agent 配置、文件/提交收据/历史和专注阅读入口收进默认关闭的 Thread 工具；切换阅读后工具自动收起。健康运行快照和空队列默认不展示。
- 待答、停止/继续、失败、冷只读与队列异常仍可处理；运行视图独立于消息面板，切换历史/文件仍可看到必要状态。目录不可用提醒在默认界面保留。
- Composer 隐去常驻“草稿/已保存”标题，保存中/错误仍反馈，快捷键与发送偏好收进输入选项。未重写消息行、富文本编辑、附件、发送/ACK/恢复、Main或OMP逻辑；已有数据未删除。
- T3 最新 main 已 clone 至 `/Users/louistation/MySpace/Life/t3code`；版本 `611132c171f3a821bd2e32f22261135cef6330ac`，干净且与origin/main一致。参考本地 ChatView 的 timeline/Composer lane 分工，未引入上游源码或依赖。

## 验证

- TDD：新增“工具默认关闭且保留 editor/reading pane”测试，旧实现真实失败（找不到 thread-tools），实现后通过。
- 受影响六个套件合计46项通过；最新 navigation-continuity 11项另在最终版本通过，包含 inspector按需显示、工具关闭仍能向既有RuntimeModel派发一次stop、待答定位与切换连续性。停止操作补测中曾因使用旧按钮文案导致断言失败，修正为当前真实文案后通过；该失败不是产品缺陷。
- `pnpm typecheck:renderer`、`pnpm lint:design`、`pnpm lint:i18n`、`pnpm build`、`pnpm check:environment`通过。Build保留现有chunk-size/PURE提示。
- `pnpm check:fast`首次在最终源码后发现结构报告陈旧；重新生成后核对并复跑。Impeccable detector覆盖主布局/运行面板/样式，返回空问题列表；后续Composer呈现收纳由设计/i18n lint覆盖。
- [真实Electron记录](evidence/thread-layout/native.json)：11项隔离GUI检查通过；light/dark、1440×900/720×540、消息滚动与Composer位置、工具边界、编辑器/控制器/阅读面板身份、长稿上限。
- [浅色普通窗口](evidence/thread-layout/thread-light-1440.png)、[深色小窗口](evidence/thread-layout/thread-dark-720.png)、[工具展开](evidence/thread-layout/thread-tools-dark-720.png)。截图来自受控模拟桥接，文字是验证fixture；不是生产内置内容、真实provider或包内验证。

复现原生检查：`node validation/m2/workbench.mjs --scenario=thread .scratch/codex-workbench-ui/evidence/thread-layout/native.json`。原生详情内容在收起的details中可仍被Chromium计算几何，故采用明确display:none边界；没有用CSS可计算的内部矩形推断其实际可见。

## Spec 与 Standards 复核

本切片为主Agent本地分别覆盖两轴，未委派独立reviewer。范围为 `git diff 56f0b0a...6202f2eb2ef81d185646fd49457191284133083a` 全部15文件，最终生成报告/交接追加单独核对。

Spec：消息与Composer两区、默认收纳、按需工具与保留必要操作符合本轮要求；未扩张消息组件、Composer功能或M3。Standards：布局只消费既有Thread/RuntimeModel，editor与ReadingPane保留挂载，原身份/选择准入/ACK与unknown政策未改；沿用自有Button、token和i18n，不新增跨模块依赖。两轴未发现剩余高价值问题；不等同独立评审或用户认可。

## 试用与限制

依赖、Electron与独立SDK资源已准备，环境检查通过。日常入口：

```sh
cd /Users/louistation/.codex/worktrees/thread-layout/d-pi
pnpm dev
```

使用这个checkout独立开发数据；选择项目/新建Thread后查看默认两区，打开Thread工具检查配置/历史。主checkout main未修改，本地分支尚未合入main或推送。没有打包、真实provider请求、系统IME/VoiceOver或长时性能验证；原A3缺口不提升。用户试用与认可待反馈，下一轮内容展示与Composer细化等待用户指令。
