# 01 原生 Provider 与 Model 接入

Status: resolved
Blocked by: none

范围和授权见[spec](../spec.md)。先核实固定 OMP 18.4.6，提供全部原生认证入口、非秘密 provider 摘要、多账户/断开、模型元数据与原生角色/配置写入、明确网络刷新。成熟原生能力用薄接入，snapshot 保持只读，scope/source/trace 与旧凭据保护不变。拥有者 OMP，Main 管临时桥接与可信目录，退出/取消释放进程监听。隔离真实 SDK 测试和负例证明行为，外部真实账户不冒称通过。

组合完成：原生能力/偏好/组件已接入集成树；验证记录在本切片 evidence 和后续交接。工程解决不等于用户认可。

独立评审补充的 request headers、lazy metadata、Settings listener helper、原生 fallback/prewalk 与 role 可用性反例均已修复。最终 19 条真实固定 OMP 隔离流程通过；两轴已复核对应修复。证据见 [native role guard](../evidence/native-role-guard-fixed.json) 与 [review](../review.md)。真实供应商账户验收仍单独保留。
