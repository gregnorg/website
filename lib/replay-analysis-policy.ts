export const SOLVER_OUTAGE_ALERT_MS = 24 * 60 * 60_000;
export const SOLVER_OUTAGE_STOP_MS = 7 * SOLVER_OUTAGE_ALERT_MS;
export const SOLVER_HEALTHY_CHECK_MS = 15 * 60_000;

export function analysisRetryDelayMs(failures: number): number {
  return Math.min(SOLVER_OUTAGE_ALERT_MS, 5 * 60_000 * 3 ** Math.max(0, failures - 1));
}
