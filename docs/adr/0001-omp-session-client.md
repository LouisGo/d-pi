# 复用完整 OMP，以 utility process 承载会话服务

本项目的产品价值是改善日常开发中的输入、阅读和后续交互，Agent 执行、工具与原生会话持久化继续由 OMP 拥有。自第一版起以 Electron utility process 承载 SessionHost，负责连接、请求关联、会话镜像与界面同步；Main 管桌面宿主和进程监督，Renderer 管交互与展示。接受额外进程和通信成本，换取会话服务独立于窗口的运行边界，避免在打磨 GUI 时重造完整 Agent Runtime。

来源：用户在「Electron GUI 架构比较」中的产品定位、utility process 要求，以及本次明确保留这些方向的指令。协议方式和具体故障行为仍须用当前 OMP 核实与原型验证；历史讨论中的助手建议不自动作为已验收事实。
