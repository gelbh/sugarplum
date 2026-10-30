import { describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { createTestEnv } from "./test-env";

describe("app.onError", () => {
  it("returns HTTPException as JSON { message } with its status", async () => {
    const env = createTestEnv();
    const res = await app.request(
      "/api/cards/any/regen",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "qa" }),
      },
      env,
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ message: "Unauthorized" });
  });
});
