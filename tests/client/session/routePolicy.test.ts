import { describe, expect, it } from "vitest";
import { sessionRouteDecision } from "../../../src/session/routePolicy";

describe("sessionRouteDecision", () => {
  it("sends authenticated account users from auth entry paths to /today", () => {
    for (const path of ["/", "", "/login", "/register"]) {
      expect(sessionRouteDecision(path, "authenticated")).toEqual({
        action: "redirect",
        to: "/today",
      });
    }
  });

  it("lets guests keep /login and /register but still leaves / for /today", () => {
    expect(sessionRouteDecision("/", "authenticated", { guest: true })).toEqual({
      action: "redirect",
      to: "/today",
    });
    expect(
      sessionRouteDecision("/login", "authenticated", { guest: true }),
    ).toEqual({ action: "allow" });
    expect(
      sessionRouteDecision("/register", "authenticated", { guest: true }),
    ).toEqual({ action: "allow" });
  });

  it("allows unauthenticated users on auth entry and legal paths", () => {
    for (const path of [
      "/",
      "/login",
      "/register",
      "/privacy",
      "/terms",
      "/data-deletion",
    ]) {
      expect(sessionRouteDecision(path, "unauthenticated")).toEqual({
        action: "allow",
      });
    }
  });

  it("allows authenticated users on legal and app paths", () => {
    expect(sessionRouteDecision("/privacy", "authenticated")).toEqual({
      action: "allow",
    });
    expect(sessionRouteDecision("/today", "authenticated")).toEqual({
      action: "allow",
    });
  });

  it("sends unauthenticated users from app paths to /login", () => {
    expect(sessionRouteDecision("/today", "unauthenticated")).toEqual({
      action: "redirect",
      to: "/login",
    });
    expect(sessionRouteDecision("/atlas", "unauthenticated")).toEqual({
      action: "redirect",
      to: "/login",
    });
  });

  it("on resolve error still allows public entry and legal", () => {
    expect(sessionRouteDecision("/privacy", "error")).toEqual({
      action: "allow",
    });
    expect(sessionRouteDecision("/", "error")).toEqual({ action: "allow" });
    expect(sessionRouteDecision("/login", "error")).toEqual({
      action: "allow",
    });
    expect(sessionRouteDecision("/today", "error")).toEqual({
      action: "pending",
    });
  });

  it("during loading allows legal and pending elsewhere", () => {
    expect(sessionRouteDecision("/privacy", "loading")).toEqual({
      action: "allow",
    });
    expect(sessionRouteDecision("/today", "loading")).toEqual({
      action: "pending",
    });
    expect(sessionRouteDecision("/", "loading")).toEqual({
      action: "pending",
    });
  });
});
