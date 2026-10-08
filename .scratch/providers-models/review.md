# Provider 与 Models 独立评审

2026-10-08；Spec 与 Standards 分别由只读 Agent 对真实 base/head 差异核对，评审者不写实现、不运行个人账户或 GUI。完整 base 为 `f649457d063f7ab8abfb82a1ba63031cbce9fe77`。

## 已修复与复核

Spec 首轮固定 `c283246`：模型选择误把 pending 当成功，草稿/确认使用更新后的 revision，失败同 ID 推理变更可能复用旧 ack。`d03e582` 和 `0a378947` 分别修复；最终 `8f47e5f` 复核这些项已关闭。测试包含真实失败后通过和成功的 native terminal/trace/generation 路径。

Standards 首轮与追加反例：deferred headers 闭包变化漏检、lazy metadata 与旧 offline cache 的窗口差异误拦、原生 Settings listener 在安装受限 resolver 之前执行无关 command key。`e39d176` / `8f47e5f` 修复。评审者使用固定修复源码独立重跑三个真实 OMP 反例全部通过，并读过 startup baseline、Main/HostConnection/RuntimeModel/Composer 终态链；这三项关闭，相关增量没有新增高价值 Standards 问题。

## 最后增量

Spec 在 `8f47e5f` 确认原生 prewalk/retry-fallback 的合法模型变更会被单一当前模型基线拒绝。官方 `agent-session` 的 usage-aware hook、`turn-recovery` 和 `prewalk` 路径可达；`4a9faa8` 改为真实模型对象各自保存声明 hash。最终 Spec 复核 `4a9faa8` 无剩余可行动问题：原生 A→B→A、lazy clone 与失败显式选择均保留原所有权，旧对象配置不会被新目录重建基线。

Standards 追加真实反例：native tiny role 在 desktop enabledModels 之外仍由 OMP 正常解析和 ephemeral 选择，旧 guard 误拦。`1f2d2bc` 仅将调用前 lookup 改为官方 `registry.getAvailable("all")`；Desktop selector 继续其 chat/enabledModels 过滤。评审者对冻结的最终实现独立复跑原始反例与完整 19 条路径全部通过。Provider 排序 `a4d25ed` 和 shipped notices `b3d3284` 的增量同样无发现。最终 Standards 无未关闭的已证实问题。

两轴分别核对了其固定 head；最后 tiny role 保护由 Standards 的独立原生反例覆盖。GUI、供应商服务和用户认可不由源码评审替代。
