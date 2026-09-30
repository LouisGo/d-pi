import { beforeEach, expect, it, vi } from "vitest";
import type { CodeViewModel, TextRange } from "../core/public";
import { MonacoViewer } from "./monaco-viewer";

type Effect = () => undefined | (() => void);
type SelectionListener = (event: { selection: TextRange }) => void;
interface Model {
  getValue(): string;
  dispose(): void;
}
interface Code {
  model: Model | null;
  listener: SelectionListener | undefined;
  getModel(): Model | null;
  onDidChangeCursorSelection(listener: SelectionListener): { dispose(): void };
  layout(): void;
  dispose(): void;
}
const harness = vi.hoisted(() => ({
  refIndex: 0,
  refs: new Array<{ current: unknown }>(),
  effects: new Array<Effect>(),
  codes: new Array<Code>(),
}));

vi.mock("react", () => ({
  useRef(initial: unknown) {
    const index = harness.refIndex++;
    harness.refs[index] ??= { current: index === 0 ? {} : initial };
    return harness.refs[index];
  },
  useEffect(effect: Effect) {
    harness.effects.push(effect);
  },
  useState(initial: unknown) {
    return [initial, () => {}];
  },
}));
vi.mock("../../preferences/renderer/public", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));
vi.mock("monaco-editor/editor/editor.worker?worker", () => ({
  default: class {},
}));
vi.mock("monaco-editor/languages/definitions/typescript/register", () => ({}));
vi.mock("monaco-editor/languages/definitions/javascript/register", () => ({}));
vi.mock("monaco-editor/languages/definitions/css/register", () => ({}));
vi.mock("monaco-editor/languages/definitions/html/register", () => ({}));
vi.mock("monaco-editor/languages/definitions/markdown/register", () => ({}));
vi.mock("monaco-editor/editor/editor.api", () => {
  function code(model: Model | null): Code {
    const result: Code = {
      model,
      listener: undefined,
      getModel: () => result.model,
      onDidChangeCursorSelection(listener) {
        result.listener = listener;
        return { dispose() {} };
      },
      layout() {},
      dispose() {},
    };
    harness.codes.push(result);
    return result;
  }
  return {
    Uri: { parse: (uri: string) => uri },
    editor: {
      defineTheme() {},
      setTheme() {},
      createModel: (raw: string): Model => ({
        getValue: () => raw.replace(/\r\n|\r|\n/g, "\n"),
        dispose() {},
      }),
      create: (_container: unknown, options: { model: Model }) =>
        code(options.model),
      createDiffEditor() {
        const original = code(null);
        const modified = code(null);
        return {
          setModel(value: { original: Model; modified: Model }) {
            original.model = value.original;
            modified.model = value.modified;
          },
          getOriginalEditor: () => original,
          getModifiedEditor: () => modified,
          layout() {},
          dispose() {},
        };
      },
    },
  };
});

beforeEach(() => {
  harness.refIndex = 0;
  harness.refs.length = 0;
  harness.effects.length = 0;
  harness.codes.length = 0;
  vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  vi.stubGlobal("getComputedStyle", () => ({
    getPropertyValue: () => "#ffffff",
  }));
  class Observer {
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal("MutationObserver", Observer);
  vi.stubGlobal("ResizeObserver", Observer);
});

function render(view: CodeViewModel, onSelection: (value: unknown) => void) {
  harness.refIndex = 0;
  harness.effects.length = 0;
  MonacoViewer({ view, onSelection });
}
function mount() {
  const cleanups = harness.effects.map((effect) => effect());
  return () => {
    for (const cleanup of cleanups) cleanup?.();
  };
}
const range = {
  startLineNumber: 1,
  startColumn: 1,
  endLineNumber: 3,
  endColumn: 2,
};
const pane = (text: string, version: string) => ({
  text,
  source: { path: "a.txt", source: "working tree", version },
});

// Narrow Node doubles exercise the production effect and registered callback;
// they do not claim a browser, real React mounting or real Monaco validation.
it("freezes the mounted raw snapshot even when Monaco normalizes mixed line endings", () => {
  const selected = vi.fn();
  render({ kind: "file", ...pane("a\r\nb\nc", "raw:v1") }, selected);
  const cleanup = mount();
  harness.codes[0]?.listener?.({ selection: range });
  expect(selected).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "selection",
      text: "a\r\nb\nc",
      version: "raw:v1",
    }),
  );
  cleanup();
});

it("keeps old-model callbacks bound to their own version and ignores callbacks after cleanup", () => {
  const selected = vi.fn();
  render({ kind: "file", ...pane("a\r\nb\nc", "raw:v1") }, selected);
  const cleanup = mount();
  const listener = harness.codes[0]?.listener;
  render({ kind: "file", ...pane("new\nversion\nhere", "raw:v2") }, selected);
  listener?.({ selection: range });
  expect(selected).toHaveBeenLastCalledWith(
    expect.objectContaining({
      text: "a\r\nb\nc",
      version: "raw:v1",
    }),
  );
  selected.mockClear();
  cleanup();
  listener?.({ selection: range });
  expect(selected).not.toHaveBeenCalled();
});

it("freezes each diff pane with its own raw content and source version", () => {
  const selected = vi.fn();
  render(
    {
      kind: "diff",
      left: pane("a\r\nb\nc", "left:v1"),
      right: pane("x\ny\r\nz", "right:v2"),
    },
    selected,
  );
  const cleanup = mount();
  harness.codes[0]?.listener?.({ selection: range });
  harness.codes[1]?.listener?.({ selection: range });
  expect(selected.mock.calls.map(([value]) => value)).toEqual([
    expect.objectContaining({ text: "a\r\nb\nc", version: "left:v1" }),
    expect.objectContaining({ text: "x\ny\r\nz", version: "right:v2" }),
  ]);
  cleanup();
});
