import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { isDirectRun } from "../server/index.js";

describe("CLI startup guard", () => {
  it("treats a Windows path argv as a direct module run", () => {
    const entry = path.resolve("server/index.js");
    expect(isDirectRun(pathToFileURL(entry).href, entry)).toBe(true);
  });
});
