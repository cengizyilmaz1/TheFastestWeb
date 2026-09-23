import { describe, expect, it } from "vitest";
import { createAutofillSession, listingSuggestions } from "./autofill";

describe("website autofill", () => {
  it("cleans measured website metadata while keeping manual country selection", () => {
    expect(listingSuggestions({ title: "  Real\nWebsite  ", description: " Useful\ttools for everyone. ", suggestedCategory: "tool", faviconUrl: "https://example.com/icon.png" }, "https://www.example.com/")).toEqual({
      name: "Real Website", description: "Useful tools for everyone.", category: "tool", faviconUrl: "https://example.com/icon.png",
    });
    expect(listingSuggestions({ title: "a".repeat(100), description: "b".repeat(600), suggestedCategory: "unknown", faviconUrl: "javascript:alert(1)" }, "https://example.com"))
      .toEqual({ name: "a".repeat(60), description: "b".repeat(500) });
    expect(listingSuggestions(null, "https://www.example.com")).toEqual({ name: "example.com" });
  });
  it("keeps edits made before or during a delayed metadata request, including cleared fields", async () => {
    const session = createAutofillSession();
    session.edit("name");
    const request = session.start();
    let finish!: () => void;
    const delayed = new Promise<void>(resolve => { finish = resolve; }).then(() => ({
      name: session.canFill(request, "name"), description: session.canFill(request, "description"), category: session.canFill(request, "category"),
    }));
    session.edit("description");
    finish();
    expect(await delayed).toEqual({ name: false, description: false, category: true });
  });
  it("ignores stale responses after another request, changed URL, reset or unmount", () => {
    const session = createAutofillSession(["category"]);
    const old = session.start(), current = session.start();
    expect(session.canFill(old, "name")).toBe(false);
    expect(session.canFill(current, "name")).toBe(true);
    expect(session.canFill(current, "category")).toBe(false);
    session.reset();
    expect(session.current(current)).toBe(false);
    const next = session.start();
    expect(session.canFill(next, "name")).toBe(true);
    expect(session.canFill(next, "category")).toBe(false);
    session.cancel();
    expect(session.canFill(next, "name")).toBe(false);
  });
});
