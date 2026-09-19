import { expect, it } from "vitest";
import { escapeXml } from "./xml";
it("neutralizes SVG element and attribute breakout", () => {
  expect(escapeXml('<script a="x">&\'</script>')).toBe("&lt;script a=&quot;x&quot;&gt;&amp;&apos;&lt;/script&gt;");
});
