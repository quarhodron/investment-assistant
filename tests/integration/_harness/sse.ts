export async function parseSseFrames(response: Response): Promise<{ event: string; data: unknown }[]> {
  const missingBody = () => {
    throw new Error("response_body_missing");
  };

  const body = (Reflect.get(response, "body") as ReadableStream<Uint8Array> | null) ?? missingBody();

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();

  return text
    .split("\n\n")
    .map((frame) => frame.trim())
    .filter(Boolean)
    .map((frame) => {
      const lines = frame.split("\n");
      const event = lines
        .find((line) => line.startsWith("event:"))
        ?.slice("event:".length)
        .trim();
      const dataLine = lines
        .find((line) => line.startsWith("data:"))
        ?.slice("data:".length)
        .trim();

      if (!event || dataLine === undefined) {
        throw new Error(`invalid_sse_frame:${frame}`);
      }

      return {
        event,
        data: JSON.parse(dataLine) as unknown,
      };
    });
}
