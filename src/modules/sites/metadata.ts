import { parse, type DefaultTreeAdapterMap } from "parse5";
import { safeFetchText } from "@/lib/security/safe-fetch";

export function parseSiteMetadata(html: string, url: string) {
  const nodes: DefaultTreeAdapterMap["node"][] = [parse(html)];
  let title = "", description = "";
  while (nodes.length) {
    const node = nodes.pop()!;
    if ("tagName" in node) {
      if (node.tagName === "title" && !title) title = node.childNodes.filter((child) => child.nodeName === "#text").map((child) => "value" in child ? child.value : "").join("");
      if (node.tagName === "meta") {
        const name = node.attrs.find((attribute) => attribute.name === "name" || attribute.name === "property")?.value.toLowerCase();
        const content = node.attrs.find((attribute) => attribute.name === "content")?.value || "";
        if (name === "description" || (!description && name === "og:description")) description = content;
        if (!title && name === "og:title") title = content;
      }
    }
    if ("childNodes" in node) nodes.push(...node.childNodes);
  }
  return { title: title.trim().slice(0, 60), description: description.trim().slice(0, 500), domain: new URL(url).hostname };
}
export async function loadSiteMetadata(url: string) {
  const result = await safeFetchText(url);
  return parseSiteMetadata(result.html, result.url);
}
