// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type {
  GitBridge,
  GitReply,
  GitRequest,
} from "../../../modules/changes/contracts/public";
import type {
  FileBridge,
  FileReply,
  FileRequest,
} from "../../../modules/files/contracts/public";
import type { CodeLocation } from "../../../modules/files/core/public";
import type { CodeView } from "../../../modules/files/renderer/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { ThreadContextSchema } from "../../../modules/threads/contracts/public";
import { FilePanel } from "./file-panel";
import type { WorkspaceSourceTarget } from "./source-target";

it.each([
  { kind: "file", navigation: false, changed: false },
  { kind: "diff", navigation: false, changed: false },
  { kind: "file", navigation: true, changed: false },
  { kind: "diff", navigation: true, changed: false },
  { kind: "file", navigation: true, changed: true },
  { kind: "diff", navigation: true, changed: true },
] as const)(
  "opens or rejects a versioned source in the focused result (%j)",
  async ({ kind, navigation, changed }) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const resource = ThreadContextSchema.parse({
      threadId: crypto.randomUUID(),
      workingDirectoryId: crypto.randomUUID(),
      directory: "/fixture",
    });
    let finish: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const fileSamples: {
      request: (command: FileRequest) => Promise<FileReply>;
    } = {
      request: async (command) => {
        if (command.kind === "list")
          return {
            kind: "entries",
            path: "",
            entries: [{ path: "README.md", name: "README.md", kind: "file" }],
            truncated: false,
          };
        await gate;
        return {
          kind: "text",
          path: command.path,
          text: "file result",
          bytes: 11,
          version: "fixture",
          capturedAt: "fixture",
          coverage: "complete",
        };
      },
    };
    const gitSamples: { request: (command: GitRequest) => Promise<GitReply> } =
      {
        request: async (command) => {
          if (command.kind === "list")
            return {
              kind: "changes",
              repository: "/fixture",
              head: "fixture",
              capturedAt: "fixture",
              coverage: "project-paths-current-sample",
              entries: [
                {
                  path: "README.md",
                  scope: "index-worktree",
                  status: "modified",
                },
              ],
              truncated: false,
            };
          await gate;
          return {
            kind: "diff",
            repository: "/fixture",
            path: command.path,
            scope: command.scope,
            capturedAt: "fixture",
            head: "fixture",
            coverage: "single-file-current-sample",
            left: {
              kind: "text",
              text: "old text",
              source: "index",
              version: "left",
              coverage: "complete",
            },
            right: {
              kind: "text",
              text: "diff result",
              source: "worktree",
              version: "right",
              coverage: "complete",
            },
          };
        },
      };
    const files: FileBridge = {
      request: async (command) => ({
        kind: "completed",
        operationId: command.operationId,
        traceId: command.traceId,
        reply: await fileSamples.request(command),
      }),
      cancel: async (command) => ({ kind: "acknowledged", ...command }),
    };
    const git: GitBridge = {
      request: async (command) => ({
        kind: "completed",
        operationId: command.operationId,
        traceId: command.traceId,
        reply: await gitSamples.request(command),
      }),
      cancel: async (command) => ({ kind: "acknowledged", ...command }),
    };
    const sourceTarget: WorkspaceSourceTarget =
      kind === "file"
        ? {
            kind: "file",
            file: {
              kind: "captured-workspace",
              threadId: resource.threadId,
              directory: resource.directory,
              path: "README.md",
              version: changed ? "old" : "fixture",
              range: { startLine: 1, endLine: 1 },
            },
          }
        : {
            kind: "diff",
            diff: {
              threadId: resource.threadId,
              directory: resource.directory,
              path: "README.md",
              scope: "index-worktree",
              leftVersion: "left",
              rightVersion: changed ? "old" : "right",
              side: "left",
              range: { startLine: 1, endLine: 1 },
            },
          };
    const intent = { ticket: 1, target: sourceTarget, phase: "ready" as const };
    const onNavigated = vi.fn();
    const Editor = ({
      view,
      location,
    }: {
      view: CodeView;
      location?: CodeLocation | undefined;
    }) =>
      createElement(
        "pre",
        {
          "data-result": true,
          "data-location": location ? JSON.stringify(location) : undefined,
        },
        view.kind === "file" ? view.text : view.right.text,
      );
    try {
      await act(() =>
        root.render(
          createElement(
            QueryClientProvider,
            { client },
            createElement(I18nProvider, {
              initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
              children: createElement(FilePanel, {
                resource,
                files,
                git,
                editor: Editor,
                onAttach: () => {},
                navigation: navigation ? intent : null,
                onNavigated,
              }),
            }),
          ),
        ),
      );
      await vi.waitFor(async () => {
        await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
        expect(container.querySelector(".file-list button")).not.toBeNull();
      });
      const browserList = container.querySelector(".file-list");
      const target = container.querySelector<HTMLButtonElement>(
        kind === "file" ? ".file-list button" : ".change-list button",
      );
      if (!target) throw Error("missing file/diff target");
      if (!navigation) await act(() => target.click());
      else expect(onNavigated).toHaveBeenCalledWith(1);
      expect(
        container.querySelector<HTMLDetailsElement>(
          ".file-navigation > [data-slot=disclosure]",
        )?.open,
      ).toBe(false);
      const result = container.querySelector(".file-result");
      expect(result).not.toBeNull();
      expect(document.activeElement).toBe(result);
      expect(result?.textContent).toContain("Loading");
      await act(async () => finish?.());
      await vi.waitFor(async () => {
        await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
        if (changed) {
          expect(result?.textContent).toContain("version has changed");
          expect(result?.querySelector("[data-result]")).toBeNull();
        } else {
          expect(result?.querySelector("[data-result]")?.textContent).toBe(
            kind === "file" ? "file result" : "diff result",
          );
          if (navigation)
            expect(
              result
                ?.querySelector("[data-result]")
                ?.getAttribute("data-location"),
            ).toContain(
              kind === "file" ? '"version":"fixture"' : '"side":"left"',
            );
        }
      });
      const details = container.querySelector<HTMLDetailsElement>(
        ".file-navigation > [data-slot=disclosure]",
      );
      if (!details) throw Error("missing browser");
      await act(() => {
        details.open = true;
        details.dispatchEvent(new Event("toggle"));
      });
      expect(container.querySelector(".file-list")).toBe(browserList);
      if (!changed)
        expect(result?.querySelector("[data-result]")).not.toBeNull();
    } finally {
      finish?.();
      await act(() => root.unmount());
      client.clear();
      container.remove();
      vi.unstubAllGlobals();
    }
  },
);
