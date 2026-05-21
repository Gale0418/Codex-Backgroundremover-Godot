import { describe, expect, it } from "vitest";
import { getAiMattingStatus } from "../server/lib/aiMatting.js";

describe("AI matting status", () => {
  it("returns explicit experimental status", async () => {
    const status = await getAiMattingStatus();
    expect(status.mode).toBe("experimental");
    expect(status.available).toBe(false);
    expect(status.message).toContain("快速 keying");
  });
});
