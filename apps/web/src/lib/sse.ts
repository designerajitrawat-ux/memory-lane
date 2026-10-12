/**
 * Reads Server-Sent Events from a fetch body (EventSource can't POST or send the bearer header).
 * Yields the `data:` payload of each event; multi-line data is joined with "\n".
 */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, "\n");
    let end = buffer.indexOf("\n\n");
    while (end !== -1) {
      const data = dataOf(buffer.slice(0, end));
      buffer = buffer.slice(end + 2);
      if (data !== null) yield data;
      end = buffer.indexOf("\n\n");
    }
    if (done) {
      const data = dataOf(buffer);
      if (data !== null) yield data;
      return;
    }
  }
}

function dataOf(block: string): string | null {
  const lines = block
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).replace(/^ /, ""));
  return lines.length ? lines.join("\n") : null;
}
