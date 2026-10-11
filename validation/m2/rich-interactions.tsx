import { createRoot } from "react-dom/client";
import { QueryProvider } from "../../src/app/renderer/wiring/query-client";
import { AnswerHistory } from "../../src/app/renderer/workbench/answer-history";
import { DecisionDock } from "../../src/app/renderer/workbench/decision-dock";
import { RuntimePanel } from "../../src/app/renderer/workbench/runtime-panel";
import type {
  Answer,
  Interaction,
  RuntimeView,
} from "../../src/modules/execution/contracts/public";
import { RuntimeModel } from "../../src/modules/execution/renderer/public";
import { I18nProvider } from "../../src/modules/preferences/renderer/public";
import { installControlFocusVisibility } from "../../src/modules/ui/renderer/public";
import { ThreadIdSchema } from "../../src/shared/identity";
import "../../src/app/renderer/styles/app.css";

const threadId = ThreadIdSchema.parse(crypto.randomUUID());
const generation = crypto.randomUUID();
const items: Interaction[] = [
  {
    id: "A",
    method: "ask",
    title: "确认迁移方案",
    status: "pending",
    expiresAt: null,
    questions: [
      {
        id: "mode",
        question: "希望如何迁移配置？",
        recommended: 0,
        options: [
          {
            label: "保留现有配置",
            description: "保留已经验证的模型与认证设置",
            preview:
              "### 迁移预览\n\n保留 **当前设置**，逐项核对来源。\n\n```ts\nconst migrated = original;\n```",
          },
          {
            label: "重新选择配置",
            description: "先检查已有配置，再选择需要调整的项",
          },
        ],
      },
      {
        id: "features",
        question: "需要启用哪些能力？",
        multi: true,
        options: [
          { label: "读取历史", description: "保留原生来源与版本" },
          { label: "展示问答", description: "分开显示写入与原生接受" },
        ],
      },
    ],
  },
  {
    id: "B",
    method: "ask",
    title: "另一个并发问题",
    status: "pending",
    expiresAt: null,
    questions: [
      {
        id: "check",
        question: "是否保留草稿？",
        options: [{ label: "保留" }, { label: "稍后处理" }],
      },
    ],
  },
];
let current: RuntimeView = {
  threadId,
  traceId: crypto.randomUUID(),
  configuration: { code: "runtime.configDefault" },
  revision: 1,
  phase: "ready",
  trusted: true,
  busy: true,
  model: "fixture",
  message: { code: "runtime.pendingInteraction" },
  connectionGeneration: generation,
  interactions: {
    nativeSessionKey: "isolated-fixture-native",
    connectionGeneration: generation,
    items,
    unsupported: false,
  },
};
let deliver: (view: RuntimeView) => void = () => {};
const writes: { id: string; answer: Answer }[] = [];
const model = new RuntimeModel({
  subscribe: (listener) => {
    deliver = listener;
    return () => {};
  },
  request: async (command) => {
    if (command.kind === "answer") {
      writes.push({ id: command.id, answer: command.answer });
      current = {
        ...current,
        revision: current.revision + 1,
        interactionOperations: [
          ...(current.interactionOperations ?? []),
          {
            operationId: command.traceId,
            threadId,
            connectionGeneration: generation,
            requestId: command.id,
            nativeSessionKey: "isolated-fixture-native",
            kind: "answer",
            status: "written",
          },
        ],
      };
    }
    return { kind: "view", view: current };
  },
});
await model.bind(threadId);
installControlFocusVisibility(document);
const probe = {
  model,
  writes,
  disconnect() {
    current = {
      ...current,
      revision: current.revision + 1,
      phase: "interrupted",
    };
    deliver(current);
  },
};
Object.assign(window, { richInteractionProbe: probe });
createRoot(document.getElementById("root")!).render(
  <QueryProvider>
    <I18nProvider
      initialSnapshot={{ preference: "zh-CN", resolvedLocale: "zh-CN" }}
    >
      <main className="thread-workspace" style={{ height: "100vh" }}>
        <div
          className="thread-reading"
          style={{ padding: "var(--panel-padding)" }}
        >
          <p className="muted">
            WB04 隔离 Renderer fixture · 不连接供应商或原生任务
          </p>
          <AnswerHistory
            threadId={threadId}
            bridge={{
              request: async () => ({
                threadId,
                source: "app-observed",
                entries: [],
                cursor: null,
              }),
            }}
          />
          <RuntimePanel
            model={model}
            inspection={false}
            onFollowUp={undefined}
          />
        </div>
        <DecisionDock model={model} />
      </main>
    </I18nProvider>
  </QueryProvider>,
);
