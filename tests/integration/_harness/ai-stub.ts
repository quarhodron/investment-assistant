import type { EncryptedBlob } from "@/lib/services/api-key-crypto";
import type { RunAiAnalysisInput, StreamEvent } from "@/lib/services/ai";

interface DecryptController {
  setKey(key: string): void;
  setError(err: Error): void;
  implementation(blob: EncryptedBlob, userId: string): Promise<string>;
}

interface RunController {
  readonly capturedOpts: RunAiAnalysisInput | null;
  setEvents(events: StreamEvent[]): void;
  setError(err: unknown): void;
  implementation(opts: RunAiAnalysisInput): AsyncGenerator<StreamEvent>;
}

export function mockRunAiAnalysis(): RunController {
  let capturedOpts: RunAiAnalysisInput | null = null;
  let events: StreamEvent[] = [];
  let error: unknown;

  const toError = (value: unknown): Error => {
    if (value instanceof Error) {
      return value;
    }
    if (typeof value === "string") {
      return new Error(value);
    }
    return new Error("non_error_thrown");
  };

  return {
    get capturedOpts() {
      return capturedOpts;
    },
    setEvents(nextEvents) {
      events = [...nextEvents];
      error = undefined;
    },
    setError(nextError) {
      error = nextError;
    },
    async *implementation(opts) {
      capturedOpts = opts;
      await Promise.resolve();

      for (const event of events) {
        if (event.kind === "text") {
          yield event;
        }
      }

      if (error !== undefined) {
        throw toError(error);
      }

      for (const event of events) {
        if (event.kind === "done") {
          yield event;
        }
      }
    },
  };
}

export function mockDecryptApiKey(): DecryptController {
  let key = "test-api-key";
  let error: Error | null = null;

  return {
    setKey(nextKey) {
      key = nextKey;
      error = null;
    },
    setError(nextError) {
      error = nextError;
    },
    implementation(_blob, _userId) {
      if (error) {
        return Promise.reject(error);
      }
      return Promise.resolve(key);
    },
  };
}
