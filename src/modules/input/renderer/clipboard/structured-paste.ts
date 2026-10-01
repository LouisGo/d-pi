// Convert inert clipboard markup to source text. No imported DOM is mounted,
// and no resource URL is fetched by this conversion.
export function htmlToEditableMarkdown(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  const children = (node: Node): string =>
    Array.from(node.childNodes)
      .map(render)
      .reduce(
        (result, part) =>
          result.endsWith("\n") && part.startsWith("\n")
            ? result.replace(/\n+$/, "\n\n") + part.replace(/^\n+/, "")
            : result + part,
        "",
      );
  const list = (element: Element, depth = 0): string =>
    Array.from(element.children)
      .filter((child) => child.tagName === "LI")
      .map((item, index) => {
        const nested: Element[] = [];
        const text = Array.from(item.childNodes)
          .map((node) => {
            if (
              node instanceof Element &&
              ["UL", "OL"].includes(node.tagName)
            ) {
              nested.push(node);
              return "";
            }
            return render(node);
          })
          .join("")
          .trim();
        const marker = element.tagName === "OL" ? `${index + 1}.` : "-";
        return `${"  ".repeat(depth)}${marker} ${text}${nested.map((child) => `\n${list(child, depth + 1)}`).join("")}`;
      })
      .join("\n");
  const table = (element: Element): string => {
    if (
      element.querySelector(
        '[rowspan]:not([rowspan="1"]),[colspan]:not([colspan="1"])',
      )
    )
      return element.outerHTML;
    const hasHeader = !!element.querySelector("tr")?.querySelector("th");
    const rows = Array.from(element.querySelectorAll("tr"))
      .filter((row) => row.closest("table") === element)
      .map((row) =>
        Array.from(row.children)
          .filter((cell) => ["TD", "TH"].includes(cell.tagName))
          .map((cell) =>
            children(cell)
              .trim()
              .replaceAll("|", "\\|")
              .replace(/\n+/g, "<br>"),
          ),
      );
    const width = Math.max(0, ...rows.map((row) => row.length));
    if (!width) return "";
    const line = (row: string[]) =>
      `| ${Array.from({ length: width }, (_, i) => row[i] ?? "").join(" | ")} |`;
    return [
      line(hasHeader ? (rows[0] ?? []) : []),
      line(Array.from({ length: width }, () => "---")),
      ...(hasHeader ? rows.slice(1) : rows).map(line),
    ].join("\n");
  };
  function render(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof Element)) return "";
    const tag = node.tagName;
    if (["SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "OBJECT"].includes(tag))
      return "";
    if (tag === "BR") return "\n";
    if (tag === "PRE") {
      const code = node.textContent ?? "";
      const fence = "`".repeat(
        Math.max(
          3,
          ...(code.match(/`+/g) ?? []).map((part) => part.length + 1),
        ),
      );
      return `\n\n${fence}\n${code.replace(/\n$/, "")}\n${fence}\n\n`;
    }
    if (["UL", "OL"].includes(tag)) return `\n\n${list(node)}\n\n`;
    if (tag === "TABLE") return `\n\n${table(node)}\n\n`;
    const text = children(node);
    if (/^H[1-6]$/.test(tag))
      return `\n\n${"#".repeat(Number(tag[1]))} ${text.trim()}\n\n`;
    if (tag === "BLOCKQUOTE")
      return `\n\n${text
        .trim()
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n")}\n\n`;
    if (["STRONG", "B"].includes(tag)) return `**${text}**`;
    if (["EM", "I"].includes(tag)) return `*${text}*`;
    if (tag === "CODE") {
      const fence = "`".repeat(
        Math.max(
          1,
          ...(text.match(/`+/g) ?? []).map((part) => part.length + 1),
        ),
      );
      return `${fence}${text}${fence}`;
    }
    if (tag === "A") {
      const href = node.getAttribute("href");
      return href && /^(https?:|mailto:)/i.test(href)
        ? `[${text.replaceAll("]", "\\]")}](${href.replaceAll("(", "%28").replaceAll(")", "%29")})`
        : text;
    }
    if (["P", "DIV", "SECTION", "ARTICLE"].includes(tag))
      return `\n\n${text}\n\n`;
    return text;
  }
  return children(template.content).trim();
}
