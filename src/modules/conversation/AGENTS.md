# conversation 模块

- `contracts/public.ts` 公开实时事件与历史页合同；`core/` 只做订阅/快照模型；`host/` 只做解码后的阅读投影；`main/` 适配原生历史读取。
- OMP 原生历史是来源；不要在 App 建第二套执行历史、从显示事件推断 ACK/完成，或因 Renderer 卸载停止后台执行。
- 旧代次、缺号、来源变化和读取缺口必须如实呈现；投影的有界缓存和订阅资源按 Host scope 释放。
- 依据 `docs/architecture/modules/conversation.md`、`flows.md` 和 `architecture/modules.json`。
