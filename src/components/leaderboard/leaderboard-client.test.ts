import { afterEach, describe, expect, it, vi } from "vitest";
import { createLeaderboardController, fetchLeaderboardPage, loadTimeMilliseconds } from "./leaderboard-client";
import type { LegacyLeaderboardSite } from "@/modules/sites/legacy-view";

const site = (id: number, time = "1 s", score = 90): LegacyLeaderboardSite => ({ id: String(id), slug: `site-${id}`,
  name: `Site ${id}`, url: `https://example.invalid/${id}`, description: "Public website", category: null, faviconUrl: null,
  currentScore: score, currentLoadTime: time });
type Page = { sites: LegacyLeaderboardSite[]; hasMore: boolean };
function deferred() {
  let resolve!: (page: Page) => void;
  const promise = new Promise<Page>((done) => { resolve = done; });
  return { promise, resolve };
}
afterEach(() => vi.unstubAllGlobals());

describe("leaderboard loading and sorting", () => {
  it.each([["950 ms", 950], ["1.2 s", 1200], [" 25 MS ", 25], ["0s", 0], [null, Infinity],
    ["Unavailable", Infinity], ["1 2 s", Infinity], ["prefix 1s", Infinity], ["1.2.3s", Infinity]] as const)(
    "parses recorded load time %s as %s milliseconds", (value, expected) => expect(loadTimeMilliseconds(value)).toBe(expected),
  );

  it("replaces a paginated sort from the server and keeps subsequent offsets in that same order", async () => {
    const load = vi.fn().mockResolvedValueOnce({ sites: [site(80, "10ms"), site(81, "20ms")], hasMore: true })
      .mockResolvedValueOnce({ sites: [site(82, "30ms")], hasMore: false });
    const controller = createLeaderboardController({ sites: [site(1), site(2)], hasMore: true }, true, load);
    await controller.sort("loadtime");
    expect(load.mock.calls[0][0]).toMatchObject({ sort: "loadtime", offset: 0, limit: 50 });
    expect(controller.getSnapshot().sites.map((row) => row.id)).toEqual(["80", "81"]);
    await controller.loadMore();
    expect(load.mock.calls[1][0]).toMatchObject({ sort: "loadtime", offset: 2, limit: 20 });
    expect(controller.getSnapshot().sites.map((row) => row.id)).toEqual(["80", "81", "82"]);
    expect(controller.getSnapshot()).toMatchObject({ hasMore: false, loading: false, error: null });
  });

  it("aborts a previous order and discards its late response even when the loader ignores cancellation", async () => {
    const old = deferred(), current = deferred();
    const load = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const controller = createLeaderboardController({ sites: [site(1)], hasMore: true }, true, load);
    const append = controller.loadMore();
    const change = controller.sort("loadtime");
    expect(load.mock.calls[0][0].signal.aborted).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({ sites: [], loading: true, sort: "loadtime" });
    current.resolve({ sites: [site(90)], hasMore: false });
    await change;
    old.resolve({ sites: [site(2)], hasMore: true });
    await append;
    expect(controller.getSnapshot()).toMatchObject({ sites: [site(90)], hasMore: false, loading: false, error: null, sort: "loadtime" });
  });

  it("prevents duplicate load clicks and keeps existing results for an append failure and retry", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("provider secret"))
      .mockResolvedValueOnce({ sites: [site(2)], hasMore: false });
    const controller = createLeaderboardController({ sites: [site(1)], hasMore: true }, true, load);
    const first = controller.loadMore();
    await controller.loadMore();
    await first;
    expect(load).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().sites).toEqual([site(1)]);
    expect(controller.getSnapshot().error).toContain("Please try again");
    expect(controller.getSnapshot().error).not.toContain("secret");
    await controller.retry();
    expect(load.mock.calls[1][0]).toMatchObject({ offset: 1, sort: "score" });
    expect(controller.getSnapshot()).toMatchObject({ sites: [site(1), site(2)], error: null });
  });

  it("deduplicates shifting ranking rows without using the shortened list as the next server offset", async () => {
    const load = vi.fn().mockResolvedValueOnce({ sites: [site(2), site(3)], hasMore: true })
      .mockResolvedValueOnce({ sites: [site(4)], hasMore: false });
    const controller = createLeaderboardController({ sites: [site(1), site(2)], hasMore: true }, true, load);
    await controller.loadMore();
    expect(controller.getSnapshot().sites.map((row) => row.id)).toEqual(["1", "2", "3"]);
    await controller.loadMore();
    expect(load.mock.calls[1][0]).toMatchObject({ offset: 4 });
  });

  it("allows an initial server failure to retry even without initial rows or a load-more flag", async () => {
    const load = vi.fn().mockResolvedValue({ sites: [site(1)], hasMore: false });
    const controller = createLeaderboardController({ sites: [], hasMore: false, error: true }, true, load);
    expect(controller.getSnapshot().error).not.toBeNull();
    await controller.retry();
    expect(load.mock.calls[0][0]).toMatchObject({ offset: 0, limit: 50, sort: "score" });
    expect(controller.getSnapshot()).toMatchObject({ sites: [site(1)], error: null, hasMore: false });
  });

  it("keeps complete tier collections local and handles seconds, milliseconds and missing values", async () => {
    const load = vi.fn();
    const controller = createLeaderboardController({ sites: [site(1, "1.2 s", 98), site(2, "900 ms", 94), site(3, "Unavailable", 99)] }, false, load);
    await controller.sort("loadtime");
    expect(controller.getSnapshot().sites.map((row) => row.id)).toEqual(["2", "1", "3"]);
    await controller.sort("score");
    expect(controller.getSnapshot().sites.map((row) => row.id)).toEqual(["3", "1", "2"]);
    await controller.loadMore();
    expect(load).not.toHaveBeenCalled();
  });

  it("does not publish a request result after unmount", async () => {
    const pending = deferred(), load = vi.fn().mockReturnValue(pending.promise);
    const controller = createLeaderboardController({ sites: [site(1)], hasMore: true }, true, load);
    const changed = vi.fn(); controller.subscribe(changed);
    const request = controller.loadMore();
    controller.dispose();
    pending.resolve({ sites: [site(2)], hasMore: false });
    await request;
    expect(changed).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().sites).toEqual([site(1)]);
  });

  it("can recover after React reconnects effects to a store with an interrupted request", async () => {
    const pending = deferred();
    const load = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ sites: [site(2)], hasMore: false });
    const controller = createLeaderboardController({ sites: [site(1)], hasMore: true }, true, load);
    const old = controller.loadMore();
    controller.dispose();
    expect(controller.getSnapshot()).toMatchObject({ loading: false, error: expect.any(String) });
    await controller.retry();
    pending.resolve({ sites: [site(99)], hasMore: true });
    await old;
    expect(controller.getSnapshot()).toMatchObject({ sites: [site(1), site(2)], loading: false, error: null });
  });
});

describe("public leaderboard API client", () => {
  it("sends the selected order, exact offset and abort signal", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ sites: [site(1)], hasMore: false }));
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    await fetchLeaderboardPage({ sort: "loadtime", offset: 50, limit: 20, signal });
    expect(fetch).toHaveBeenCalledWith("/api/sites?sort=loadtime&offset=50&limit=20", { signal, cache: "no-store" });
  });

  it.each([Response.json({ error: "internal detail" }, { status: 503 }), Response.json({ sites: [], hasMore: true }),
    Response.json({ sites: [{ ...site(1), name: {} }], hasMore: false }), Response.json({ sites: [site(1)] })])(
    "rejects failed or malformed responses instead of silently ending the list", async (response) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      await expect(fetchLeaderboardPage({ sort: "score", offset: 0, limit: 20, signal: new AbortController().signal }))
        .rejects.toThrow("Please try again");
    },
  );
});
