# 02 配置、认证与模型

Status: claimed
Blocked by: none

所属范围与授权见 [spec](../spec.md)。

复用固定 OMP 18.3.0 原生模块的短生命周期配置/认证接入，同上下文模型与档位，原生秘密存储和取消；真实供应商仅在授权后验收。

## Comments

2026-10-06：获本轮真实调用授权后，现有本机 OpenAI 认证与 GPT-5.6 Luna/high 已通过正式 m2.20 GUI 新 Thread 生成/阅读及原生收据核对，见[真实闭环](../real-provider-e2e.md)。不等于新增登录、DeepSeek 或全部配置组合验收，本票保持 claimed。

2026-09-30：M2 明确授权接续 S5；这是工程票，用户认可在 spec 单独维护。

2026-10-01：本次 OMP 18.4.6 加固已完成 scope/trace/source 身份、原生整条无写读取和真实 metadata 推理选择/回读三项缺口，见[加固配置票](../../runtime-hardening-omp1845/issues/02-configuration-contract.md)。Finder来源选择/修复、真实两条账户认证及子 Agent Thread覆盖仍在本票/05，不因局部修复关闭完整02。

2026-10-01：用户报告 CLI 已登录但 Electron 重开读取失败，明确要求根因修复与双向共享验证。已复现正常 WAL 被旧适配拒绝、CLI 模型缓存被遗漏、partial 未记原因三项代码/验证缺口；正常双向场景补入常规门禁，修复与交付见 [配置复用修复](../configuration-sharing.md)。保留本票其它未完成范围，不把 fixture 当成真实供应商账户验收。

2026-10-01：m2.8 实际试用暴露模型/档位回填及冷只读说明不足，Computer use 已确认。局部修复仍为本地源码，新候选未通过包内闭环，不标交付；CLI 历史发现不属于此前已交付配置共享行为。见 [进度核对](../progress-audit.md)，本票其余范围与用户认可边界不变。
