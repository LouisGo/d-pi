# 类型安全路由试用交接

2026-10-01。路由接入工程完成，已交付本地试用，用户认可待反馈。没有推送或公开发布。

## 精确构建

- 实现源码：`acf535c45c6bf774cf657f65c896b951ed24ae93`，干净隔离副本构建（dirty=false）。后续交接提交只补验证脚本的 CDP 返回值修复与交付记录，不改变生产源码。
- 版本/构建：`0.1.0-m2.9` / `acf535c4-88948e3f`。
- 本地包：`/Users/louistation/MySpace/Life/d-pi/dist/router-integration/mac-arm64/d-pi.app`。
- `Contents/Resources/app.asar` SHA-256：`9c6ebdd9e76fe7dd7e33630d0bdcd44e3e273dfcaac41642d8696f4129cf2ce2`。交付副本与真实验证源包相同。
- Router `1.170.41`、plugin `1.168.42`、CLI `1.167.40` 精确锁定；实际 history `1.162.4`、core `1.171.34`。

## 试用路径

1. 从上述包打开工作台，打开项目并创建两个会话，分别保留不同草稿。
2. 切换会话/只读文件/提交原文/原生历史：页签与显示状态对应，草稿、编辑器和阅读滚动保持。
3. 点左侧会话及工具栏后退/前进：Main 确认选择后显示对应会话，草稿与消息不串线。
4. 输入法组合期间尝试换会话/后退：保持当前会话；组合结束后可切换。正常退出仍沿用原有草稿保存握手。
5. 若出现“无法确认选中的 Thread”，使用“核对当前 Thread”；只读核对成功后继续，不自动重发选择命令。

当前 memory history 属于本窗口，刷新/重开从 Main 真实选择初始化；阅读页签不跨重启持久化，外部深链接不在本切片。

## 验证与证据

- 完整 `pnpm check`：475 行为测试通过、1 项固定 CLI 原生 smoke 显式 opt-in 跳过；33 架构和47 tooling 通过。六环境 typecheck 包含真实注册树的导航正反例：错误目标、缺失/错误/额外 params、未经解析的 ThreadId、非法页签都被拒绝。
- 删除干净副本中的 `route-tree.gen.ts`，`pnpm typecheck` 重新生成字节一致，所有环境检查通过；`pnpm build` 和 macOS arm64 打包成功。
- 实际 Electron 打包验证 `[--router]`：四个页签逐一断言 hidden/aria-pressed 后核对同一 Composer 与全部面板 DOM、草稿及滚动；工具栏 back/forward、可信 Chromium IME 阻止 POP 和 Thread 点击；独立撤销/选区；两个真实 OMP 并行；刷新不重发；冷恢复保持只读和草稿。11 项全部通过，结果见[原始记录](evidence/native-result.json)。
- 复测入口：`pnpm validate:router`，默认验证上方交付包。测试生成隔离数据、配置及localhost供应商，不继承真实凭据。
- [独立审查](review.md)：Main 选择恢复、并发导航承诺、同位置快捷分支、迟到新建会话定位和验证证据问题均已修复，最后事务范围11/11独立复核通过。
- 原生截图保存在 `dist/router-integration/evidence/`。最初一次原生脚本因 CDP 序列化 DOM 引用失败，修正仅返回布尔值后全程通过；未以失败运行冒充通过。

## 实质限制

- 原生执行使用固定 OMP 与隔离localhost fixture，2 次调用，无真实供应商凭据/计费。输入法是可信 Chromium composition，未切换 macOS 系统输入源。
- 本地开发包沿用 unsigned 配置，未形成公开签名/公证发行。
- Router CLI 有上游循环依赖警告；生成和实际构建通过。构建仍有较大 Monaco/语言包 chunk 警告，未因此修改既有编辑器/代码高亮范围。
- 用户原有未跟踪 `bun.lock` 保留，不属于本次提交；工程与 Agent 验证不构成用户体验认可。
