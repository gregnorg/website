// Preserve preview order when the network is healthy, but never let provisional
// animations hold an official move behind seconds of retries.
export async function flushPreviewQueue(pending: Promise<void>, timeoutMs = 300): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      pending.catch(() => undefined),
      new Promise<void>(resolve => { timer = setTimeout(resolve, timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
