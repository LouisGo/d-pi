## Summary

Provider 配置和模型选择原先只有简化入口，难以管理原生账户、模型能力或会话中的实际选择。本次承接固定 OMP 18.4.6 的全部原生认证入口、账户管理、可用性、模型目录/角色和自定义模型，提供 Provider 主从设置与 Composer 模型 panel。搜索、厂商 rail、真实品牌图标、收藏/可见性/排序和推理档位沿用 d-pi 的组件、密度与深浅主题。

OMP 持有凭据、配置、模型与执行；App 仅持设备 picker 偏好。模型切换等待同一 trace/generation 的 Host 终态和实际模型回读，失败/unknown 保留原生事实。旧草稿、删除和断开确认不会使用新 revision 覆盖外部改动。范围和全部认证授权见 [spec](spec.md)。

## Evidence

本地 base `f649457d063f7ab8abfb82a1ba63031cbce9fe77`，分支 `codex/providers-models`。完整检查、真实 SDK 隔离回归、红灯/绿灯与未验证项见 [validation](validation.md)；两轴独立结论见 [review](review.md)。GUI 的实际构建身份、SDK 完整性与流程结果以 [gui-flow](evidence/gui-flow.json) 为准，不能把 fixture 当成真实供应商验收。

新增认证范围经用户确认取代 D-23 的首版两入口限制，原生协议没有重写。没有 push、远端 PR、merge 或 CI 的验证证据。

## Merge Danger

代码可 revert，数据和外部效果构成 one-way door：App schema 13 升级前创建备份，但回退代码不能自动降级已迁移数据库；显式原生认证、断开、角色和模型编辑写入 OMP 的共享配置与 credential store，revert 不撤销这些用户动作。恢复数据库需核对备份及后续新数据，不能直接删除数据库掩盖问题。

影响链为 Renderer → Main 的可信配置/Runtime 桥接 → 固定 OMP Host；收藏与隐藏仅影响本机 picker。scope/source/revision/trace、目录身份和执行许可保持。App 串行和 revision CAS 能拒绝已检测的外部冲突，不提供跨 CLI 进程锁；未知或损坏配置保持明确失败。读取不联网、不跑 helper，计费探测仅在明确原生认证/刷新入口发生并显示其性质。

回滚实现时保留原生文件、账户、会话与 App 数据；根据实际持久化变更单独处理恢复。品牌资产来源/许可证已记录，不新增依赖或平台支持承诺。工程完成与 Dev 交付不代表用户认可或真实供应商服务已验收。
