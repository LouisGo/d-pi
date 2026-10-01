# 02 配置、认证与模型

Status: claimed
Blocked by: none

所属范围与授权见 [spec](../spec.md)。

复用固定 OMP 18.3.0 原生模块的短生命周期配置/认证接入，同上下文模型与档位，原生秘密存储和取消；真实供应商仅在授权后验收。

## Comments

2026-09-30：M2 明确授权接续 S5；这是工程票，用户认可在 spec 单独维护。

2026-10-01：本次 OMP 18.4.6 加固已完成 scope/trace/source 身份、原生整条无写读取和真实 metadata 推理选择/回读三项缺口，见[加固配置票](../../runtime-hardening-omp1845/issues/02-configuration-contract.md)。Finder来源选择/修复、真实两条账户认证及子 Agent Thread覆盖仍在本票/05，不因局部修复关闭完整02。
