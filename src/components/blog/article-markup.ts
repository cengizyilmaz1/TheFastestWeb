/**
 * Presentation-only rehype step for journal articles. The articles are written with pipe tables and
 * "[ ]" checklists, which plain MDX leaves as literal text. This turns them into real tables and
 * checklist items so they can be typeset. Anything that does not match the strict shapes below is
 * left exactly as it was.
 */
type HastNode = { type: string; tagName?: string; value?: string; children?: HastNode[]; properties?: Record<string, unknown> };

const element = (tagName: string, children: HastNode[], properties: Record<string, unknown> = {}): HastNode => ({ type: "element", tagName, properties, children });
const textOf = (nodes: HastNode[]): string => nodes.map((node) => node.type === "text" ? node.value ?? "" : textOf(node.children ?? [])).join("");

/** Split inline children wherever a top-level text node contains the separator. */
function splitInline(nodes: HastNode[], separator: string): HastNode[][] {
  const parts: HastNode[][] = [[]];
  for (const node of nodes) {
    if (node.type !== "text") { parts[parts.length - 1].push(node); continue; }
    (node.value ?? "").split(separator).forEach((piece, index) => {
      if (index) parts.push([]);
      if (piece) parts[parts.length - 1].push({ type: "text", value: piece });
    });
  }
  return parts;
}

function trimCell(cell: HastNode[]): HastNode[] {
  const copy = cell.map((node) => ({ ...node }));
  const first = copy[0], last = copy[copy.length - 1];
  if (first?.type === "text") first.value = (first.value ?? "").trimStart();
  if (last?.type === "text") last.value = (last.value ?? "").trimEnd();
  return copy.filter((node) => node.type !== "text" || node.value);
}

function toTable(paragraph: HastNode): HastNode | null {
  const lines = splitInline(paragraph.children ?? [], "\n").filter((line) => textOf(line).trim());
  if (lines.length < 3 || !lines.every((line) => /^\|.*\|$/.test(textOf(line).trim()))) return null;
  const rows = lines.map((line) => splitInline(line, "|").slice(1, -1).map(trimCell));
  const width = rows[0].length;
  if (!width || !rows.every((row) => row.length === width) || !rows[1].every((cell) => /^:?-+:?$/.test(textOf(cell)))) return null;
  const [head, , ...body] = rows;
  return element("div", [element("table", [
    element("thead", [element("tr", head.map((cell) => element("th", cell, { scope: "col" })))]),
    element("tbody", body.map((row) => element("tr", row.map((cell) => element("td", cell))))),
  ])], { className: ["article-table"], tabIndex: 0, role: "group", ariaLabel: "Table" });
}

function toTask(item: HastNode): boolean {
  const holder = item.children?.find((child) => child.type !== "text" || (child.value ?? "").trim());
  const target = holder?.type === "element" && holder.tagName === "p" ? holder.children?.[0] : holder;
  const match = target?.type === "text" ? /^\s*\[( |x|X)\]\s+/.exec(target.value ?? "") : null;
  if (!target || !match) return false;
  target.value = (target.value ?? "").slice(match[0].length);
  item.properties = { ...item.properties, "data-task": match[1] === " " ? "open" : "done" };
  return true;
}

export function rehypeArticleMarkup() {
  return function transform(tree: HastNode) {
    const walk = (node: HastNode) => {
      const children = node.children;
      if (!children) return;
      children.forEach((child, index) => {
        if (child.type !== "element") return walk(child);
        if (child.tagName === "p") { const table = toTable(child); if (table) { children[index] = table; return; } }
        if (child.tagName === "ul") {
          const items = (child.children ?? []).filter((item) => item.type === "element" && item.tagName === "li");
          const tasks = items.filter(toTask);
          if (tasks.length && tasks.length === items.length) child.properties = { ...child.properties, className: ["article-checklist"] };
        }
        walk(child);
      });
    };
    walk(tree);
  };
}
