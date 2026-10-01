# conversation 模块

- 拥有实时阅读投影、snapshot/update 水位、历史查询适配和阅读模型；不启动、停止、恢复或重新执行 OMP。
- `host` 只把已关联的原生帧投影为有界阅读事件；`main` 读取 OMP 原生历史；Renderer 订阅并释放视图资源。
- 保留 connectionGeneration/seq/gap/source/coverage 证据，旧代次和缺口不能静默覆盖当前阅读状态。
- 维持 full 消息与 message_end 最终正文；prompt_result 或收据已持久不证明最终正文已到 Renderer，阅读镜像不结算提交。
- CLI 历史发现按当前项目 v3 header 匹配，只读且有界；Renderer 仅传不透明 key，不产生执行绑定或迁移原生目录。
