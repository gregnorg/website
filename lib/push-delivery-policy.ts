export function retryablePushStatus(status: number) {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}
export function pushRetryDelay(attempt: number) {
  return Math.min(60 * 60, 30 * 2 ** Math.min(Math.max(attempt - 1, 0), 7));
}
