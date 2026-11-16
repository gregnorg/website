import assert from "node:assert/strict";
import test from "node:test";
import { readJsonBody, RequestBodyError } from "../lib/request-body.ts";

test("JSON bodies are limited while streaming even without a content length", async () => {
  let canceled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(1024)); },
    cancel() { canceled = true; },
  });
  const request = new Request("https://example.test", { method: "POST", body, duplex: "half" } as RequestInit);
  await assert.rejects(() => readJsonBody(request, 2048), (e: unknown) => e instanceof RequestBodyError && e.status === 413);
  assert.equal(canceled, true);
});

test("bounded JSON parsing accepts valid input and rejects malformed UTF-8 and JSON", async () => {
  const request = (body: string | Uint8Array) => new Request("https://example.test", { method: "POST", body: body as BodyInit });
  assert.deepEqual(await readJsonBody(request('{"ok":true}')), { ok: true });
  await assert.rejects(() => readJsonBody(request("{")), RequestBodyError);
  await assert.rejects(() => readJsonBody(request(new Uint8Array([0xff]))), RequestBodyError);
});
