# configuration 模块

- OMP 拥有原生配置、凭据、认证与模型目录；本模块仅持受控桌面接入、非秘密摘要及临时认证生命周期。
- 新 snapshot/login/save-key 必须携带 application 或 Thread scope 与 traceId；Main 从可信 Thread 仓储固定目录/环境并在资源等待后复核，不接受 Renderer 任意 cwd，不回退活动 Thread。Query key 与请求一致，拒绝错位响应。认证续步和清理按旧 jobId 找原 scope/source。
- API key/回调输入只经 IPC 和短生命周期子进程 stdin，不入 argv、App 数据库或诊断；原生保存失败不先删除旧认证。
- 读取不启动项目 Agent；执行侧仍复核项目信任。取消、超时、退出释放认证子进程与监听，不自动登录或计费探测。
- snapshot 全链只读：有限文件和 readonly SQLite 事务及时 close，官方认证组合在内存中完成；模型缓存通过 SQLite serialize 的一致快照交给私有临时库中的官方模型组合，退出清理；禁止迁移、修复、创建原生 DB、执行 key/helper、网络刷新或加载项目扩展。未知 schema/损坏/symlink/读取锁超时/remote auth/账户缓存覆盖缺口返回 partial/unavailable 和 unknown，不包装成完整目录或无认证。正常 WAL 必须读取已提交内容；SQLite 的 WAL/SHM 协调文件允许由原生只读连接管理，不 checkpoint，不修改凭据/配置或模型缓存源内容。
- 模型能力来自固定版本原生 metadata/helper，默认、explicit off 和 effort 传输语义分开；minimal 可表达，不可调档和 requiresEffort 不给虚假选项。18.4.6 使用官方 ThinkingLevel.Off；未指定实际值为 inherit。应用前复核、完成后显示原生回读，不复制品牌规则或把 unknown 命令当成功。
