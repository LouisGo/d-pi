import { beforeEach, expect, it, vi } from "vitest";
import type { CodeViewModel, TextRange } from "../core/public";
import { MonacoViewer } from "./monaco-viewer";

type Effect = () => undefined | (() => void);
type SelectionListener = (event: { selection: TextRange }) => void;
interface Model {
  getValue(): string;
  dispose(): void;
}
interface Viewer {
  layout(): void;
  dispose(): void;
}
interface Code extends Viewer {
  model: Model | null;
  listener: SelectionListener | undefined;
  getModel(): Model | null;
  onDidChangeCursorSelection(listener: SelectionListener): { dispose(): void };
}
interface MutationObservation {
  callback(): void;
  attributes: readonly string[] | undefined;
  disconnected: boolean;
}
interface ResizeObservation {
  callback(entries: readonly ObservedSize[]): void;
  disconnected: boolean;
}
interface ObservedSize {
  target: unknown;
  contentRect: { width: number; height: number };
}
const harness = vi.hoisted(() => ({
  refIndex: 0,
  refs: new Array<{ current: unknown }>(),
  effects: new Array<Effect>(),
  codes: new Array<Code>(),
  viewers: new Array<Viewer>(),
  models: new Array<Model>(),
  mutations: new Array<MutationObservation>(),
  resizes: new Array<ResizeObservation>(),
  defineTheme: vi.fn(),
  setTheme: vi.fn(),
  nextFrame: 0,
  frames: new Map<number, FrameRequestCallback>(),
  cancelFrame: vi.fn(),
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
      layout: vi.fn(),
      dispose: vi.fn(),
    };
    harness.codes.push(result);
    return result;
  }
  return {
    Uri: { parse: (uri: string) => uri },
    editor: {
      defineTheme: harness.defineTheme,
      setTheme: harness.setTheme,
      createModel(raw: string): Model {
        const model = {
          getValue: () => raw.replace(/\r\n|\r|\n/g, "\n"),
          dispose: vi.fn(),
        };
        harness.models.push(model);
        return model;
      },
      create(_container: unknown, options: { model: Model }) {
        const editor = code(options.model);
        harness.viewers.push(editor);
        return editor;
      },
      createDiffEditor() {
        const original = code(null);
        const modified = code(null);
        const editor = {
          setModel(value: { original: Model; modified: Model }) {
            original.model = value.original;
            modified.model = value.modified;
          },
          getOriginalEditor: () => original,
          getModifiedEditor: () => modified,
          layout: vi.fn(),
          dispose: vi.fn(),
        };
        harness.viewers.push(editor);
        return editor;
      },
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  harness.refIndex = 0;
  harness.refs.length = 0;
  harness.effects.length = 0;
  harness.codes.length = 0;
  harness.viewers.length = 0;
  harness.models.length = 0;
  harness.mutations.length = 0;
  harness.resizes.length = 0;
  harness.nextFrame = 0;
  harness.frames.clear();
  harness.cancelFrame.mockImplementation((id: number) =>
    harness.frames.delete(id),
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++harness.nextFrame;
    harness.frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", harness.cancelFrame);
  vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("document", {
    documentElement: { dataset: { theme: "light", density: "normal" } },
  });
  vi.stubGlobal("getComputedStyle", () => ({
    getPropertyValue: () =>
      document.documentElement.dataset.theme === "dark" ? "#123456" : "#abcdef",
  }));
  class MutationObserver implements MutationObservation {
    attributes: readonly string[] | undefined;
    disconnected = false;
    constructor(readonly callback: () => void) {
      harness.mutations.push(this);
    }
    observe(_target: unknown, options: { attributeFilter: readonly string[] }) {
      this.attributes = options.attributeFilter;
    }
    disconnect() {
      this.disconnected = true;
    }
  }
  class ResizeObserver implements ResizeObservation {
    disconnected = false;
    constructor(readonly callback: (entries: readonly ObservedSize[]) => void) {
      harness.resizes.push(this);
    }
    observe() {}
    disconnect() {
      this.disconnected = true;
    }
  }
  vi.stubGlobal("MutationObserver", MutationObserver);
  vi.stubGlobal("ResizeObserver", ResizeObserver);
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

function changeAttribute(attribute: string, value: string) {
  document.documentElement.dataset[attribute] = value;
  for (const observer of harness.mutations) {
    if (
      !observer.disconnected &&
      observer.attributes?.includes(`data-${attribute}`)
    )
      observer.callback();
  }
}
function notifyResize(width: number, height: number) {
  harness.resizes[0]?.callback([
    { target: harness.refs[0]?.current, contentRect: { width, height } },
  ]);
}
function flushFrame() {
  const callbacks = [...harness.frames.values()];
  harness.frames.clear();
  for (const callback of callbacks) callback(0);
}
function appearanceView(kind: "file" | "diff"): CodeViewModel {
  const content = pane("a\nb", "raw:v1");
  return kind === "file"
    ? { kind, ...content }
    : { kind, left: content, right: pane("x\ny", "raw:v2") };
}

// Narrow Node doubles exercise the production effect and registered callback;
// they do not claim a browser, real React mounting or real Monaco validation.
it.each(["file", "diff"] as const)(
  "applies theme colors only when the theme changes without laying out or replacing the %s viewer",
  (kind) => {
    render(appearanceView(kind), vi.fn());
    const cleanup = mount();
    const editor = harness.viewers[0];
    expect(harness.defineTheme).toHaveBeenCalledTimes(1);
    expect(harness.defineTheme).toHaveBeenLastCalledWith(
      "d-pi",
      expect.objectContaining({
        base: "vs",
        colors: expect.objectContaining({ "editor.background": "#abcdef" }),
      }),
    );
    changeAttribute("density", "compact");
    changeAttribute("theme", "light");
    expect(harness.defineTheme).toHaveBeenCalledTimes(1);
    changeAttribute("theme", "dark");
    expect(harness.defineTheme).toHaveBeenCalledTimes(2);
    expect(harness.defineTheme).toHaveBeenLastCalledWith(
      "d-pi",
      expect.objectContaining({
        base: "vs-dark",
        colors: expect.objectContaining({ "editor.background": "#123456" }),
      }),
    );
    expect(harness.setTheme).toHaveBeenCalledTimes(2);
    expect(editor?.layout).not.toHaveBeenCalled();
    expect(harness.viewers).toEqual([editor]);
    expect(harness.models).toHaveLength(kind === "file" ? 1 : 2);
    cleanup();
  },
);

it.each(["file", "diff"] as const)(
  "lays out the %s viewer at its initial visible size and coalesces real size changes per frame",
  (kind) => {
    render(appearanceView(kind), vi.fn());
    const cleanup = mount();
    const editor = harness.viewers[0];
    notifyResize(640, 360);
    expect(editor?.layout).not.toHaveBeenCalled();
    flushFrame();
    expect(editor?.layout).toHaveBeenCalledTimes(1);
    notifyResize(640, 360);
    expect(harness.frames.size).toBe(0);
    changeAttribute("density", "compact");
    notifyResize(640, 340);
    notifyResize(600, 320);
    notifyResize(580, 300);
    expect(harness.frames.size).toBe(1);
    expect(editor?.layout).toHaveBeenCalledTimes(1);
    flushFrame();
    expect(editor?.layout).toHaveBeenCalledTimes(2);
    notifyResize(580, 300);
    flushFrame();
    expect(editor?.layout).toHaveBeenCalledTimes(2);
    expect(harness.defineTheme).toHaveBeenCalledTimes(1);
    expect(harness.viewers).toEqual([editor]);
    cleanup();
  },
);

it.each(["file", "diff"] as const)(
  "restores the %s viewer after zero size and skips a same-frame return to its current size",
  (kind) => {
    render(appearanceView(kind), vi.fn());
    const cleanup = mount();
    const editor = harness.viewers[0];
    notifyResize(0, 0);
    flushFrame();
    expect(editor?.layout).toHaveBeenCalledTimes(1);
    notifyResize(640, 360);
    flushFrame();
    expect(editor?.layout).toHaveBeenCalledTimes(2);
    notifyResize(300, 200);
    notifyResize(640, 360);
    flushFrame();
    expect(editor?.layout).toHaveBeenCalledTimes(2);
    cleanup();
  },
);

it.each(["file", "diff"] as const)(
  "cancels queued layout and ignores late notifications after disposing the %s viewer",
  (kind) => {
    render(appearanceView(kind), vi.fn());
    const cleanup = mount();
    const editor = harness.viewers[0];
    notifyResize(640, 360);
    const queuedLayout = [...harness.frames.values()][0];
    cleanup();
    cleanup();
    expect(harness.mutations[0]?.disconnected).toBe(true);
    expect(harness.resizes[0]?.disconnected).toBe(true);
    expect(harness.cancelFrame).toHaveBeenCalledTimes(1);
    expect(harness.frames.size).toBe(0);
    expect(editor?.dispose).toHaveBeenCalledTimes(1);
    for (const model of harness.models)
      expect(model.dispose).toHaveBeenCalledTimes(1);
    document.documentElement.dataset.theme = "dark";
    harness.mutations[0]?.callback();
    notifyResize(600, 340);
    queuedLayout?.(0);
    flushFrame();
    expect(harness.frames.size).toBe(0);
    expect(editor?.layout).not.toHaveBeenCalled();
    expect(harness.defineTheme).toHaveBeenCalledTimes(1);
  },
);

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
