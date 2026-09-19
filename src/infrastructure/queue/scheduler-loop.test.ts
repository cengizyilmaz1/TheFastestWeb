import { afterEach, describe, expect, it, vi } from "vitest";
import { startSchedulerLoop } from "./scheduler-loop";

afterEach(() => vi.useRealTimers());
const settle = async () => { for (let index = 0; index < 10; index++) await Promise.resolve(); };

describe("serialized scheduler", () => {
  it("never overlaps ticks and drains the current dispatch before close", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const tasks = {
      scheduleDailyRetests: vi.fn().mockResolvedValue(undefined),
      scheduleMaintenance: vi.fn().mockResolvedValue(undefined),
      dispatchDueJobs: vi.fn(() => new Promise<void>((resolve) => { release = resolve; })),
    };
    const loop = startSchedulerLoop(tasks, 1000);
    await settle();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(tasks.dispatchDueJobs).toHaveBeenCalledTimes(1);
    expect(loop.isReady()).toBe(false);
    let closed = false;
    const close = loop.close().then(() => { closed = true; });
    await settle();
    expect(closed).toBe(false);
    release();
    await close;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(tasks.scheduleDailyRetests).toHaveBeenCalledTimes(1);
  });
  it("dispatches saved work when daily scheduling fails and recovers readiness on a later tick", async () => {
    vi.useFakeTimers();
    const tasks = {
      scheduleDailyRetests: vi.fn().mockRejectedValueOnce(new Error("DB unavailable")).mockResolvedValue(undefined),
      scheduleMaintenance: vi.fn().mockResolvedValue(undefined),
      dispatchDueJobs: vi.fn().mockResolvedValue(undefined),
    };
    const loop = startSchedulerLoop(tasks, 1000);
    await settle();
    expect(tasks.dispatchDueJobs).toHaveBeenCalledTimes(1);
    expect(loop.isReady()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(loop.isReady()).toBe(true);
    await loop.close();
    expect(loop.isReady()).toBe(false);
  });
});
