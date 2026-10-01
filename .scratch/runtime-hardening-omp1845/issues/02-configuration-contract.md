# 02 配置身份、只读读取与模型能力修复

Status: open
Blocked by: 01

范围/授权见 [spec](../spec.md)，接口见 [design](../design.md)。承接 [M2 02](../../m2-first-release/issues/02-configuration-models.md)的三个已确认缺口；关联 D-03/D-04/D-23/D-25/D-35/D-37。

## 目标与修改范围

同一配置场景完整修正 query key→IPC scope→Main 解析→Bun 读取→响应身份；snapshot 与显式认证写入分离；模型能力/选择保真并实际回读。configuration contracts/main/renderer、runtime/configuration.mjs、ModelControls、preload/Main 装配、必要 execution 模型选择合同同批更新。

Main 固定真实 scope/job/source；Thread 仓储提供可信目录；OMP 拥有配置/认证；读适配拥有有限 readonly 文件/数据库句柄并及时 close；UI 不拥有第二套认证或模型规则。身份变更经公开面，机器依赖如实更新。

## TDD 与验收

1. 真实 QueryClient+schema+Main 类：A 发起、资源等待、切 B、完成；A 的 cwd/默认模型仍进入 A，错位响应被拒，删除/重关联 A 不回退 B。application scope、认证旧 job 取消出口也覆盖。
2. 实际 SDK 隔离查询：legacy models.json 与新 YAML 优先级、缺 DB、旧 schema、损坏/符号链接、项目覆盖、无执行信任。查询前后文件集合/哈希/权限/schema 不变，无网络/helper/项目扩展；unsafe 路径返回明确 partial/unavailable。
3. 同版本真实 metadata 四类 effort；默认/off/明确 effort 有不同传输语义，支持 minimal，requiresEffort 不提供 off，不可调模型不提供虚假菜单；应用结果与 Host 实际回读一致。
4. 显式 DeepSeek 保存失败保留旧 key，OpenAI challenge/prompt 与取消释放的已有正确行为回归；日志/DTO 无秘密。不运行真实供应商费用探测。

只读全链的关键未知在本票内先做一个最小样本，不建立全局验证平台。若必须 fork SDK/复制完整认证系统，采用 design 的保守失败分支并记录限制；其它已明确修复继续。源码存在无写 helper 不等于验收已经通过。

M2 来源选择、真实账户认证和子 Agent 模型覆盖仍由原票承接。本票完成不能将原 M2 02 整票标 resolved。

## Comments

2026-10-01：缺陷与目标已核对，待方案审阅及目标 SDK 集成。
