const lifecycle = globalThis as typeof globalThis & { __thefastestwebStopping?: boolean };

export function isShuttingDown(): boolean {
  return lifecycle.__thefastestwebStopping === true;
}

export function markShuttingDown(): void {
  lifecycle.__thefastestwebStopping = true;
}
