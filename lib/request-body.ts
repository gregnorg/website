export class RequestBodyError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

// Limit bytes while reading, rather than checking only after buffering the body.
export async function readJsonBody(request: Request, maxBytes = 4096): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new RequestBodyError("Request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError("Invalid JSON.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RequestBodyError("Request is too large.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new RequestBodyError("Invalid JSON.", 400); }
}

export async function readJsonObject(request: Request, maxBytes = 4096): Promise<Record<string, unknown>> {
  const value = await readJsonBody(request, maxBytes);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RequestBodyError("Expected a JSON object.", 400);
  return value as Record<string, unknown>;
}
