import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("px-2 py-1", "px-4", { hidden: false, block: true })).toBe("py-1 px-4 block");
  });
});
