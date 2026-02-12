import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveStorePath } from "./paths.js";

describe("resolveStorePath", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses DEWBOT_HOME for tilde expansion", () => {
    vi.stubEnv("DEWBOT_HOME", "/srv/dewbot-home");
    vi.stubEnv("HOME", "/home/other");

    const resolved = resolveStorePath("~/.dewbot/agents/{agentId}/sessions/sessions.json", {
      agentId: "research",
    });

    expect(resolved).toBe(
      path.resolve("/srv/dewbot-home/.dewbot/agents/research/sessions/sessions.json"),
    );
  });
});
