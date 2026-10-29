import { describe, expect, it } from "vitest";
import {
  FREE_GEN_DAILY_CAP_DISPLAY,
  freeGenFaqBody,
  freeGenIntroBlurb,
} from "../../src/settings/freeGenFaq";

describe("freeGenFaq", () => {
  it("exports display cap 20", () => {
    expect(FREE_GEN_DAILY_CAP_DISPLAY).toBe(20);
  });

  it("FAQ covers attempts, no refund, UTC, BYO", () => {
    const body = freeGenFaqBody();
    expect(body).toMatch(/attempts/i);
    expect(body).toMatch(/not credits/i);
    expect(body).toContain(String(FREE_GEN_DAILY_CAP_DISPLAY));
    expect(body).toMatch(/UTC/i);
    expect(body).toMatch(/fail/i);
    expect(body).toMatch(/delet/i);
    expect(body).toMatch(/reject/i);
    expect(body).toMatch(/does not restore|do not restore/i);
    expect(body).toMatch(/midnight/i);
    expect(body).toMatch(/API key|own.*key/i);
  });

  it("intro blurb mentions cap and UTC day", () => {
    const intro = freeGenIntroBlurb();
    expect(intro).toContain(String(FREE_GEN_DAILY_CAP_DISPLAY));
    expect(intro).toMatch(/UTC day/i);
    expect(intro).toMatch(/Optional/i);
    expect(intro).toMatch(/Z\.ai/i);
  });

  it("FAQ mentions Z.ai free Flash BYO option", () => {
    expect(freeGenFaqBody()).toMatch(/Z\.ai/i);
    expect(freeGenFaqBody()).toMatch(/Flash/i);
  });
});
