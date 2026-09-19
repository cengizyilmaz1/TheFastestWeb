import { describe, expect, it } from "vitest";
import { rehypeArticleMarkup } from "./article-markup";

type Node = { type: string; tagName?: string; value?: string; children?: Node[]; properties?: Record<string, unknown> };
const text = (value: string): Node => ({ type: "text", value });
const el = (tagName: string, children: Node[]): Node => ({ type: "element", tagName, properties: {}, children });
const flat = (node: Node): string => node.type === "text" ? node.value ?? "" : (node.children ?? []).map(flat).join("");

describe("article markup", () => {
  it("turns a strict pipe table into a table and keeps inline markup inside cells", () => {
    const tree: Node = { type: "root", children: [el("p", [text("| Setup | Score |\n|---|:--:|\n| Uses "), el("code", [text("priority")]), text(" | 90-100 |")])] };
    rehypeArticleMarkup()(tree);
    const table = tree.children![0].children![0];
    expect(tree.children![0].properties?.className).toEqual(["article-table"]);
    expect(table.tagName).toBe("table");
    const [head, body] = table.children!;
    expect(head.children![0].children!.map(flat)).toEqual(["Setup", "Score"]);
    expect(body.children).toHaveLength(1);
    expect(body.children![0].children!.map(flat)).toEqual(["Uses priority", "90-100"]);
    expect(body.children![0].children![0].children![1].tagName).toBe("code");
  });

  it("leaves paragraphs that only look like tables untouched", () => {
    const ragged = el("p", [text("| a | b |\n|---|---|\n| only one |")]);
    const noDelimiter = el("p", [text("| a | b |\n| c | d |\n| e | f |")]);
    const prose = el("p", [text("Use a | b to pipe output.")]);
    const tree: Node = { type: "root", children: [ragged, noDelimiter, prose] };
    rehypeArticleMarkup()(tree);
    expect(tree.children!.map((child) => child.tagName)).toEqual(["p", "p", "p"]);
  });

  it("marks checklist items and strips the literal box, but only flags the list when every item is a task", () => {
    const tasks = el("ul", [el("li", [text("[ ] Hero image is WebP")]), el("li", [el("p", [text("[x] TTFB is under 800ms")])])]);
    const mixed = el("ul", [el("li", [text("[ ] One task")]), el("li", [text("A plain item")])]);
    const tree: Node = { type: "root", children: [tasks, mixed] };
    rehypeArticleMarkup()(tree);
    expect(tasks.properties?.className).toEqual(["article-checklist"]);
    expect(tasks.children!.map((item) => item.properties?.["data-task"])).toEqual(["open", "done"]);
    expect(tasks.children!.map(flat)).toEqual(["Hero image is WebP", "TTFB is under 800ms"]);
    expect(mixed.properties?.className).toBeUndefined();
    expect(flat(mixed.children![1])).toBe("A plain item");
  });
});
