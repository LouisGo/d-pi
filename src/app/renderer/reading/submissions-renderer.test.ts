// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  type SubmissionReceipt,
  SubmissionReceiptSchema,
  SubmissionRejectionReasonSchema,
} from "../../../modules/execution/contracts/public";
import { SubmissionModel } from "../../../modules/execution/renderer/public";
import { DraftSchema } from "../../../modules/input/contracts/public";
import { DraftController } from "../../../modules/input/core/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { ThreadIdSchema } from "../../../shared/identity";
import { locateAttention } from "../workbench/attention-location";
import { Submissions } from "./submissions";

const diagnosticTraceId = crypto.randomUUID();
const originalText = "用户提交原文\r\nKeep **Markdown** and 😀 unchanged";
const refusalCopy = {
  "content-missing": ["图片资源缺失", "Image resources are missing"],
  "content-corrupt": ["完整性校验", "integrity"],
  "transport-too-large": ["应用传输预算", "transport budget"],
  "image-unsupported": ["图像", "image"],
  "not-ready": ["会话尚未就绪", "session has no ready model"],
  "native-unavailable": ["原生会话未连接", "native session is not connected"],
  "unsupported-native-command": [
    "应用托管的原生命令",
    "managed native command",
  ],
  paused: ["原生队列已暂停", "native queue is paused"],
  "interaction-pending": ["有原生对话框等待回答", "native dialog is waiting"],
  "stale-target": ["旧的原生会话实例", "older session instance"],
  "correlation-limit": ["未确认的派发过多", "too many dispatches"],
} as const;

const mounted: {
  root: Root;
  container: HTMLElement;
  model: SubmissionModel;
  controller: DraftController;
}[] = [];

afterEach(async () => {
  for (const { root, container, model, controller } of mounted.splice(0)) {
    await act(() => root.unmount());
    model.dispose();
    controller.dispose();
    container.remove();
  }
  vi.unstubAllGlobals();
});

async function renderReceipt(
  locale: "zh-CN" | "en-US",
  status: Pick<SubmissionReceipt, "state" | "outcome"> &
    Partial<Pick<SubmissionReceipt, "rejectionReason">>,
) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const draft = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/isolated-renderer-fixture",
    revision: 1,
    text: "later draft remains intact",
  });
  const receipt = SubmissionReceiptSchema.parse({
    ...status,
    submissionId: crypto.randomUUID(),
    threadId: draft.threadId,
    traceId: diagnosticTraceId,
    revision: 0,
    text: originalText,
    requestId: crypto.randomUUID(),
    target: {
      processInstanceId: crypto.randomUUID(),
      connectionGeneration: crypto.randomUUID(),
      configContextId: "isolated-config",
      nativeSessionRef: "isolated-native-session",
    },
    acknowledgedAt: status.state === "acknowledged" ? "ACK" : null,
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:00.000Z",
  });
  const commands: string[] = [];
  const controller = new DraftController(
    draft,
    async () => {
      throw Error("Rendering a receipt must not save the draft");
    },
    () => {
      throw Error("Unexpected draft failure");
    },
  );
  const model = new SubmissionModel(
    {
      subscribe: () => () => {},
      request: async (command) => {
        commands.push(command.kind);
        if (command.kind === "list")
          return { kind: "list", receipts: [receipt] };
        throw Error("Rendering a receipt must not dispatch");
      },
    },
    draft.threadId,
    controller,
  );
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container, model, controller });
  await act(async () => {
    await model.refresh();
    root.render(
      createElement(I18nProvider, {
        initialSnapshot: { preference: locale, resolvedLocale: locale },
        children: createElement(Submissions, { model }),
      }),
    );
  });
  expect(container.querySelector("pre")?.textContent).toBe(originalText);
  expect(controller.getTextSnapshot()).toBe(draft.text);
  expect(commands.every((kind) => kind === "list")).toBe(true);
  return container;
}

it.each(SubmissionRejectionReasonSchema.options)(
  "renders the persisted %s cause for an ordinary submission in both UI languages",
  async (rejectionReason) => {
    for (const [index, locale] of (["zh-CN", "en-US"] as const).entries()) {
      const container = await renderReceipt(locale, {
        state: "rejected",
        outcome: "unobserved",
        rejectionReason,
      });
      expect(container.textContent).toContain(
        refusalCopy[rejectionReason][index],
      );
      expect(container.textContent).not.toMatch(
        /追发未发出|Follow-up not sent/,
      );
    }
  },
);

it("keeps an unreported refusal cause generic without inventing a recovery fact", async () => {
  for (const locale of ["zh-CN", "en-US"] as const) {
    const container = await renderReceipt(locale, {
      state: "rejected",
      outcome: "unobserved",
    });
    expect(container.textContent).toContain(
      locale === "zh-CN" ? "未发送，原文保留" : "Not sent",
    );
    for (const reason of Object.values(refusalCopy))
      expect(container.textContent).not.toContain(
        locale === "zh-CN" ? reason[0] : reason[1],
      );
  }
});

it.each(["failed", "unknown"] as const)(
  "retains call ACK and its independent %s outcome without claiming acceptance or completion",
  async (outcome) => {
    for (const locale of ["zh-CN", "en-US"] as const) {
      const container = await renderReceipt(locale, {
        state: "acknowledged",
        outcome,
      });
      expect(container.textContent).toContain(
        locale === "zh-CN" ? "已收到调用回执" : "Call receipt received",
      );
      expect(container.textContent).toContain(
        locale === "zh-CN"
          ? outcome === "failed"
            ? "原生返回失败"
            : "后续结果未知"
          : outcome === "failed"
            ? "Native call failed"
            : "Later result unknown",
      );
    }
  },
);

it("click location reveals and focuses the current failed receipt without dispatching", async () => {
  const container = await renderReceipt("zh-CN", {
    state: "acknowledged",
    outcome: "failed",
  });
  expect(container.querySelector("details")?.open).toBe(false);
  const record = container.querySelector<HTMLElement>("article");
  if (!record) throw Error("missing record");
  record.scrollIntoView = vi.fn();
  locateAttention(container, {
    threadId: ThreadIdSchema.parse(crypto.randomUUID()),
    eventId: crypto.randomUUID(),
    traceId: diagnosticTraceId,
    kind: "failed",
    unread: true,
  });
  expect(container.querySelector("details")?.open).toBe(true);
  expect(document.activeElement).toBe(record);
  expect(record.textContent).toContain("原生返回失败");
});
