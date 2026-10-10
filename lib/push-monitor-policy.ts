export type PushHealth = {
  failed_count: number;
  latest_failed_id: string;
  stalled_jobs: number;
  delayed_deliveries: number;
  worker_age_seconds: number;
  worker_error: string | null;
};

export function pushHealthProblems(health: PushHealth) {
  const problems: string[] = [];
  if (health.failed_count > 0) problems.push(`${health.failed_count} new permanent push delivery failure(s).`);
  if (health.stalled_jobs > 0) problems.push(`${health.stalled_jobs} turn notification job(s) have waited more than 10 minutes.`);
  if (health.delayed_deliveries > 0) problems.push(`${health.delayed_deliveries} push delivery request(s) remain pending after 15 minutes.`);
  if (health.worker_age_seconds >= 20 * 60) problems.push("The push retry worker has not completed successfully for at least 20 minutes.");
  if (health.worker_error) problems.push(`The push retry worker reported an error: ${health.worker_error}`);
  return problems;
}

export function shouldSendPushAlert(problems: readonly string[], newFailures: number, lastAlert: Date | null, now: Date) {
  return problems.length > 0 && (newFailures > 0 || !lastAlert || now.getTime() - lastAlert.getTime() >= 60 * 60 * 1000);
}
