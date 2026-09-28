import { useSyncExternalStore } from "react";
import { match } from "ts-pattern";
import { Button } from "@/components/ui/button";
import type { RuntimeModel } from "../features/runtime/model";
export function RuntimePanel({ model }: { model: RuntimeModel }) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  if (!state)
    return (
      <p className="muted" role="status">
        正在读取项目执行状态…
      </p>
    );
  const label = match(state.phase)
    .with("browse", () => "仅浏览")
    .with("allowed", () => "已允许项目执行")
    .with("starting", () => "正在启动 OMP")
    .with("ready", () => (state.busy ? "OMP 正在工作" : "OMP 已就绪"))
    .with("interrupted", () => "原生状态待确认")
    .with("failed", () => "OMP 尚未就绪")
    .exhaustive();
  return (
    <section className="runtime-panel" aria-label="项目执行">
      <strong role="status">{label}</strong>
      <span className="muted">{state.configuration}</span>
      {state.model && <span>模型：{state.model}</span>}
      <p className="muted">{state.message}</p>
      <div className="flex gap-2">
        {!state.trusted && (
          <Button
            disabled={state.phase === "starting"}
            onClick={() => void model.act("allow")}
          >
            允许项目执行
          </Button>
        )}
        {state.trusted &&
          (state.phase === "allowed" || state.phase === "failed") && (
            <Button onClick={() => void model.act("start")}>启动 OMP</Button>
          )}
        {state.trusted && (
          <Button variant="ghost" onClick={() => void model.act("revoke")}>
            撤销执行授权
          </Button>
        )}
        <Button variant="ghost" onClick={() => void model.act("inspect")}>
          检查状态
        </Button>
      </div>
    </section>
  );
}
