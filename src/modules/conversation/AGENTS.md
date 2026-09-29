# conversation 模块

- 拥有实时阅读投影、snapshot/update 水位、历史查询适配和阅读模型；不启动、停止、恢复或重新执行 OMP。
- `host` 只把已关联的原生帧投影为有界阅读事件；`main` 读取 OMP 原生历史；Renderer 订阅并释放视图资源。
- 保留 generation/seq/gap/source/coverage 证据，旧代次和缺口不能静默覆盖当前阅读状态。
