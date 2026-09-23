/** Match the directory's approved public listing states. */
export const PUBLIC_SCREENSHOT_LIFECYCLES = ["active", "verified"] as const;

export function allowsPublicScreenshot(lifecycle: string): boolean {
  return PUBLIC_SCREENSHOT_LIFECYCLES.some((state) => state === lifecycle);
}
