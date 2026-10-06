# 诊断切片 TDD

2026-10-06，公共合同起点4cf37b9。Main/preload新增边界：

- 首个正式本地导出测试先失败（尚无IPC模块），最小实现后通过。首次命令 `pnpm test -- <file>` 意外执行整个行为套件：原723通过/2跳过，新模块缺失1失败。后续使用 `node scripts/testing/test.mjs vitest <files>` 正确限定范围。
- 同URL导航期间等待原生保存，目标失败回归确实在未实现generation检查时失败；补源文档代次后通过。
- preload foreign trace/wrong kind/foreign filter 回包测试先因无bridge失败，最小校验后通过。
- 受控取消、trusted-source拒绝、并发busy/释放、路径/超预算请求、磁盘写失败和typed失败补测通过。它们是新增实现后的回归覆盖，不伪称逐项开发红灯。

原始命令结果：diagnostics-main-red.txt / diagnostics-main-green.txt / diagnostics-navigation-red.txt / diagnostics-navigation-green.txt / diagnostics-preload-red.txt / diagnostics-preload-green.txt / diagnostics-main-preload-green.txt。本次测试只使用受控临时文件和IPC夹具，原生保存/真实GUI留待包内验收。

读取器7轮真实红绿与10行为/2 Writer回归见 diagnostics-reader/README.md及原始日志。GUI初始5条红绿与scope焦点红绿见 diagnostics-gui/；最终10 React行为通过。缓存回收是随后回归覆盖，不冒独立红灯。

整段集成首轮完整check发现既有SSR i18n渲染因直接读取window失败（diagnostics-engineering-initial-failure.txt），改Diagnostics拥有安全默认桥接后既有i18n与10 GUI行为通过（diagnostics-ssr-green.txt）。另主动核对实际Node SQLite错误code=ERR_SQLITE_ERROR/errcode=1，新增causeCode保留测试真实红灯→白名单已知码/安全数字后缀最小实现→绿（diagnostics-sqlite-code-red/green.txt）。两个补修已由两轴独立追加审查覆盖。

首轮实际包harness在9MiB扫描场景open自动读取未结束就apply另一scope，Main有界并发返回typed busy，脚本只等成功快照而超时。原失败日志/DOM与两次实际completed约263.56/260.24ms确认这是harness操作竞态；49cfaa3仅等待初始自动采样完成后apply，未改产品、桥接或任何预算/成功断言。源ba0e7df不变；用户读中换scope仍可显式busy/手动刷新，迟到不串scope已分别由React/Main回归证明，不冒称任意重叠读取都成功。最终实际运行结果单独维护。

最终同一clean产品包21项实际macOS检查exit0，含原生保存/取消/Writer故障；机器结果见diagnostics-macos/。首次失败DOM、截图与包身份保留于diagnostics-package-first-failure/。最终完整check 751行为/34架构/74工具和交接check:fast通过。
