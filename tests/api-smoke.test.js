import { describe, expect, it } from "vitest";
import { createApp } from "../server/index.js";

describe("API smoke", () => {
  it("returns health status", async () => {
    const app = await createApp();
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.app).toBe("godot-video-background-remover");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
