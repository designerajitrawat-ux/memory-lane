import { describe, expect, it } from "vitest";
import { readSse } from "./sse";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

async function collect(chunks: string[]) {
  const out: string[] = [];
  for await (const d of readSse(streamOf(chunks))) out.push(d);
  return out;
}

describe("readSse", () => {
  it("handles events split across chunks and CRLF line ends", async () => {
    expect(await collect(['data: {"a"', ':1}\n\ndata: {"b":2}\r\n\r', "\n"])).toEqual([
      '{"a":1}',
      '{"b":2}',
    ]);
  });

  it("joins multi-line data, ignores comments and flushes the last event", async () => {
    expect(await collect([": keep-alive\n\n", "data: one\ndata: two\n\n", "data: last"])).toEqual([
      "one\ntwo",
      "last",
    ]);
  });
});
