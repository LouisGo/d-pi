import { type ReactNode, useEffect, useState } from "react";
import { Button, type ButtonProps } from "./button";
import { AnchoredTooltip, Tooltip } from "./tooltip";

export interface ComposerTagIcon {
  paths: readonly (
    | string
    | {
        d: string;
        opacity?: string;
        fillRule?: "evenodd";
        clipRule?: "evenodd";
      }
  )[];
  viewBox?: string;
  filled?: boolean;
  name?: string;
}
/** No attachment or editor identity: consumers supply the label and optional adornments. */
export interface ComposerTagContent {
  label: string;
  tone?: "neutral" | "blue" | "teal";
  detail?: string | null | undefined;
  leading?: (ComposerTagIcon & { label?: string }) | undefined;
  status?:
    | { paths: readonly string[]; label: string; kind: string }
    | undefined;
  description?: string | null | undefined;
}
export type ComposerTagProps = ComposerTagContent &
  Omit<ButtonProps, "children" | "variant" | "size" | "appearance" | "title">;
// T3 middleTruncateAttachmentName default: 36 total, preserving 14 tail graphemes.
const labelLimit = 36;
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export function composerTagLabel(label: string) {
  const characters = Array.from(
    segmenter.segment(label),
    (part) => part.segment,
  );
  return characters.length <= labelLimit
    ? { start: label, end: "", truncated: false }
    : {
        start: characters.slice(0, 21).join(""),
        end: characters.slice(-14).join(""),
        truncated: true,
      };
}
function tooltipText({ label, detail, description }: ComposerTagContent) {
  return [label, detail, description].filter(Boolean).join("\n");
}
function Icon({ paths, viewBox, filled, name }: ComposerTagIcon) {
  return (
    <svg
      viewBox={viewBox ?? "0 0 24 24"}
      data-file-icon={name}
      width="16"
      height="16"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      {paths.map((d) => (
        <path
          key={typeof d === "string" ? d : d.d}
          {...(typeof d === "string" ? { d } : d)}
        />
      ))}
    </svg>
  );
}
function TagContent({ label, leading, detail, status }: ComposerTagContent) {
  const shown = composerTagLabel(label);
  return (
    <>
      {leading && (
        <span className="composer-context-type" aria-hidden="true">
          <Icon {...leading} />
          {leading.label && <span>{leading.label}</span>}
        </span>
      )}
      <span className="composer-context-name">
        <span className="composer-tag-prefix">{shown.start}</span>
        {shown.truncated && (
          <>
            <span>…</span>
            <span className="composer-tag-suffix">{shown.end}</span>
          </>
        )}
      </span>
      {detail && (
        <span className="composer-context-size" aria-hidden="true">
          {detail}
        </span>
      )}
      {status && (
        <span
          className="composer-context-status"
          data-status={status.kind}
          aria-hidden="true"
        >
          <Icon paths={status.paths} />
        </span>
      )}
    </>
  );
}
/** Spaces belong to presentation, so editor serialization and frozen submissions stay intact. */
export function ComposerTag({
  label,
  detail,
  leading,
  status,
  description,
  tone = "neutral",
  ...props
}: ComposerTagProps) {
  const content = { label, detail, leading, status, description };
  return (
    <span className="composer-tag" hidden={props.hidden}>
      {" "}
      <Tooltip
        side="top"
        content={
          <span className="composer-tag-tooltip">{tooltipText(content)}</span>
        }
      >
        <Button
          {...props}
          variant="context"
          data-composer-tag-tone={tone}
          aria-label={
            props["aria-label"] ??
            [label, detail, description].filter(Boolean).join(" · ")
          }
        >
          <TagContent {...content} />
        </Button>
      </Tooltip>{" "}
    </span>
  );
}

// DOM adapter for atomic editors. The editor consumes a serializable recipe,
// without a React root, portal or subscription for every inline atom.
export type ComposerTagMarkup = readonly [
  string,
  Record<string, unknown>,
  ...(string | ComposerTagMarkup)[],
];
function iconMarkup({
  paths,
  viewBox,
  filled,
  name,
}: ComposerTagIcon): ComposerTagMarkup {
  return [
    "http://www.w3.org/2000/svg svg",
    {
      viewBox: viewBox ?? "0 0 24 24",
      "data-file-icon": name,
      width: 16,
      height: 16,
      fill: filled ? "currentColor" : "none",
      stroke: filled ? "none" : "currentColor",
      "stroke-width": 1.5,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      focusable: "false",
    },
    ...paths.map(
      (path): ComposerTagMarkup => [
        "http://www.w3.org/2000/svg path",
        typeof path === "string"
          ? { d: path }
          : {
              d: path.d,
              opacity: path.opacity,
              "fill-rule": path.fillRule,
              "clip-rule": path.clipRule,
            },
      ],
    ),
  ];
}
export function composerTagMarkup(
  content: ComposerTagContent,
  attrs: Record<string, unknown> = {},
): ComposerTagMarkup {
  const { label, detail, leading, status } = content;
  const { contenteditable, ...tagAttrs } = attrs;
  const shown = composerTagLabel(label);
  const children: ComposerTagMarkup[] = [];
  if (leading)
    children.push([
      "span",
      { class: "composer-context-type", "aria-hidden": "true" },
      iconMarkup(leading),
      ...(leading.label
        ? [["span", {}, leading.label] as ComposerTagMarkup]
        : []),
    ]);
  children.push([
    "span",
    { class: "composer-context-name" },
    ["span", { class: "composer-tag-prefix" }, shown.start],
    ...(shown.truncated
      ? ([
          ["span", {}, "…"],
          ["span", { class: "composer-tag-suffix" }, shown.end],
        ] as ComposerTagMarkup[])
      : []),
  ]);
  if (detail)
    children.push([
      "span",
      { class: "composer-context-size", "aria-hidden": "true" },
      detail,
    ]);
  if (status)
    children.push([
      "span",
      {
        class: "composer-context-status",
        "data-status": status.kind,
        "aria-hidden": "true",
      },
      iconMarkup(status),
    ]);
  return [
    "span",
    {
      class: "composer-tag",
      hidden: attrs.hidden,
      contenteditable,
    },
    " ",
    [
      "span",
      {
        class: "composer-context-token",
        role: "button",
        "data-composer-tag-tone": content.tone ?? "neutral",
        "aria-label": [label, detail, content.description]
          .filter(Boolean)
          .join(" · "),
        ...tagAttrs,
        "data-composer-tag-tooltip": tooltipText(content),
      },
      ...children,
    ],
    " ",
  ];
}

/** One delegated Tooltip for DOM-rendered tags; no per-atom lifecycle or focus changes. */
export function ComposerTagTooltips({
  container,
}: {
  container: HTMLElement | null;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!container) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let keyboardSelection = false;
    const close = () => {
      clearTimeout(timer);
      setAnchor(null);
    };
    const target = (value: EventTarget | null) =>
      value instanceof Element
        ? value.closest<HTMLElement>("[data-composer-tag-tooltip]")
        : null;
    const hover = (event: Event) => {
      const tag = target(event.target);
      if (!tag || tag.hidden) return;
      clearTimeout(timer);
      timer = setTimeout(() => setAnchor(tag), 120);
    };
    const leave = (event: PointerEvent) => {
      if (target(event.target) !== target(event.relatedTarget)) close();
    };
    const pointerDown = () => {
      keyboardSelection = false;
      close();
    };
    const keyDown = (event: KeyboardEvent) => {
      keyboardSelection = ["ArrowLeft", "ArrowRight"].includes(event.key);
      close();
    };
    const observer = new MutationObserver(() => {
      if (keyboardSelection) {
        setAnchor(
          container.querySelector<HTMLElement>(
            ".composer-tag.ProseMirror-selectednode [data-composer-tag-tooltip]",
          ),
        );
      } else {
        setAnchor((current) =>
          current && container.contains(current) ? current : null,
        );
      }
    });
    observer.observe(container, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    container.addEventListener("pointerover", hover);
    container.addEventListener("pointerout", leave);
    container.addEventListener("focusin", hover);
    container.addEventListener("focusout", close);
    container.addEventListener("pointerdown", pointerDown);
    container.addEventListener("keydown", keyDown);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      container.removeEventListener("pointerover", hover);
      container.removeEventListener("pointerout", leave);
      container.removeEventListener("focusin", hover);
      container.removeEventListener("focusout", close);
      container.removeEventListener("pointerdown", pointerDown);
      container.removeEventListener("keydown", keyDown);
    };
  }, [container]);
  const active = anchor && container?.contains(anchor) ? anchor : null;
  const content: ReactNode = (
    <span className="composer-tag-tooltip">
      {active?.getAttribute("data-composer-tag-tooltip")}
    </span>
  );
  return <AnchoredTooltip anchor={active} content={content} />;
}
