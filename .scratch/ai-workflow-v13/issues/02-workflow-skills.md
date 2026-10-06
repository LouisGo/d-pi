# 02 工作流规则与 skills

Status: resolved
Blocked by: none

范围与授权见 [spec](../spec.md)。更新任务约定、Agent 入口和词汇表引用；新增执行、评审、PR、retro 四个仓库 skills 与 PR 模板。规则单源在任务约定，skill 只路由和提供相应操作。

验收：当前授权 leaf 调度、单写管理状态、独立 worktree 与冲突处理、两轴 review 的真实差异覆盖、外部动作授权与本地降级、证据层级、受控 retro；所有现行链接有效，历史快照保留。

## Comments

2026-10-06：四个仓库 skill、任务约定/根路由/PR 模板已接入；GLOSSARY 内容保持原样，现行链接同步。check:fast 通过。skill-creator quick_validate 因两个可用 Python 均缺 PyYAML 无法启动，改用系统 Ruby YAML.safe_load 核实 frontmatter、命名、描述与四份 UI 元数据通过；没有安装或改动个人全局环境。行为检验与两轴 review 归03。
