import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/api/client", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    ApiError,
    me: vi.fn(),
    api: vi.fn(),
  };
});

import { ApiError } from "../../src/api/client";
import { resolveSession } from "../../src/session/resolveSession";

const guestUser = { id: "guest-local", email: "guest@local" };

describe("resolveSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls me even when guest flag set and uses account on success", async () => {
    const onAccountFromGuest = vi.fn(async () => {});
    const user = { id: "u1", email: "a@b.c" };
    const me = vi.fn(async () => user);
    const result = await resolveSession({
      isGuest: () => true,
      me,
      guestUser,
      onAccountFromGuest,
    });
    expect(me).toHaveBeenCalled();
    expect(result).toEqual({ status: "authenticated", user });
    expect(onAccountFromGuest).toHaveBeenCalled();
  });

  it("falls back to guest on 401 when guest flag set", async () => {
    const result = await resolveSession({
      isGuest: () => true,
      me: async () => {
        throw new ApiError(401, "Unauthorized");
      },
      guestUser,
    });
    expect(result).toEqual({ status: "authenticated", user: guestUser });
  });

  it("falls back to guest on non-401 me failure when guest flag set", async () => {
    const result = await resolveSession({
      isGuest: () => true,
      me: async () => {
        throw new ApiError(503, "down");
      },
      guestUser,
    });
    expect(result).toEqual({ status: "authenticated", user: guestUser });
  });

  it("returns authenticated on me success", async () => {
    const user = { id: "u1", email: "a@b.c" };
    const result = await resolveSession({
      isGuest: () => false,
      me: async () => user,
      guestUser,
    });
    expect(result).toEqual({ status: "authenticated", user });
  });

  it("returns unauthenticated on 401 without guest flag", async () => {
    const result = await resolveSession({
      isGuest: () => false,
      me: async () => {
        throw new ApiError(401, "Unauthorized");
      },
      guestUser,
    });
    expect(result).toEqual({ status: "unauthenticated" });
  });

  it("returns error on non-401 failure", async () => {
    const result = await resolveSession({
      isGuest: () => false,
      me: async () => {
        throw new ApiError(503, "down");
      },
      guestUser,
    });
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.message).toMatch(/down/i);
  });
});
