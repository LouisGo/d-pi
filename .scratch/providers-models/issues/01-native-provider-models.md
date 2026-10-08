# 01 原生 Provider 与 Model 接入

Status: claimed
Blocked by: none

范围和授权见[spec](../spec.md)。先核实固定 OMP 18.4.6，提供全部原生认证入口、非秘密 provider 摘要、多账户/断开、模型元数据与原生角色/配置写入、明确网络刷新。成熟原生能力用薄接入，snapshot 保持只读，scope/source/trace 与旧凭据保护不变。拥有者 OMP，Main 管临时桥接与可信目录，退出/取消释放进程监听。隔离真实 SDK 测试和负例证明行为，外部真实账户不冒称通过。
