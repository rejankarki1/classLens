export function logTiming(scope: string, phase: string, ms: number, meta: Record<string, unknown> = {}): void {
  console.log(`[timing] ${scope} ${phase} ${Math.round(ms)}ms`, meta);
}
