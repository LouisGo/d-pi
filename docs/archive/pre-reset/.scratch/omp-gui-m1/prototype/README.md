# 接入边界原型

用途：为 M1 规格验证进程链路，不是应用实现。需要 macOS arm64、本机 OMP 18.3.0 和 Electron 42.11.1。

本次运行命令（Electron 是本机缓存解压的运行时）：

```sh
env -u ELECTRON_RUN_AS_NODE /tmp/d-pi-m1-electron-42.11.1/Electron.app/Contents/MacOS/Electron .scratch/omp-gui-m1/prototype/main.cjs
```

从仓库根运行。可替换前面的 Electron 路径；OMP 路径目前固定在 Host 中。原型在本目录的忽略目录中写入独立配置和原生测试会话，localhost 模型响应不会访问真实模型提供商；显式测试扩展仅发起 confirm。结果写入 `result.json`，失败返回非零退出码。

测试完成后清理自身进程；原型中的生命周期处理不作为生产实现。详细证明范围见 `../research/findings.md`。
