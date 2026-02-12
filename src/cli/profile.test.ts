import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";

describe("parseCliProfileArgs", () => {
  it("leaves gateway --dev for subcommands", () => {
    const res = parseCliProfileArgs(["node", "dewbot", "gateway", "--dev", "--allow-unconfigured"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "dewbot", "gateway", "--dev", "--allow-unconfigured"]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "dewbot", "--dev", "gateway"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "dewbot", "gateway"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs(["node", "dewbot", "--profile", "work", "status"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "dewbot", "status"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "dewbot", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (dev first)", () => {
    const res = parseCliProfileArgs(["node", "dewbot", "--dev", "--profile", "work", "status"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (profile first)", () => {
    const res = parseCliProfileArgs(["node", "dewbot", "--profile", "work", "--dev", "status"]);
    expect(res.ok).toBe(false);
  });
});

describe("applyCliProfileEnv", () => {
  it("fills env defaults for dev profile", () => {
    const env: Record<string, string | undefined> = {};
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    const expectedStateDir = path.join(path.resolve("/home/peter"), ".dewbot-dev");
    expect(env.DEWBOT_PROFILE).toBe("dev");
    expect(env.DEWBOT_STATE_DIR).toBe(expectedStateDir);
    expect(env.DEWBOT_CONFIG_PATH).toBe(path.join(expectedStateDir, "dewbot.json"));
    expect(env.DEWBOT_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      DEWBOT_STATE_DIR: "/custom",
      DEWBOT_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.DEWBOT_STATE_DIR).toBe("/custom");
    expect(env.DEWBOT_GATEWAY_PORT).toBe("19099");
    expect(env.DEWBOT_CONFIG_PATH).toBe(path.join("/custom", "dewbot.json"));
  });

  it("uses DEWBOT_HOME when deriving profile state dir", () => {
    const env: Record<string, string | undefined> = {
      DEWBOT_HOME: "/srv/dewbot-home",
      HOME: "/home/other",
    };
    applyCliProfileEnv({
      profile: "work",
      env,
      homedir: () => "/home/fallback",
    });

    const resolvedHome = path.resolve("/srv/dewbot-home");
    expect(env.DEWBOT_STATE_DIR).toBe(path.join(resolvedHome, ".dewbot-work"));
    expect(env.DEWBOT_CONFIG_PATH).toBe(path.join(resolvedHome, ".dewbot-work", "dewbot.json"));
  });
});

describe("formatCliCommand", () => {
  it("returns command unchanged when no profile is set", () => {
    expect(formatCliCommand("dewbot doctor --fix", {})).toBe("dewbot doctor --fix");
  });

  it("returns command unchanged when profile is default", () => {
    expect(formatCliCommand("dewbot doctor --fix", { DEWBOT_PROFILE: "default" })).toBe(
      "dewbot doctor --fix",
    );
  });

  it("returns command unchanged when profile is Default (case-insensitive)", () => {
    expect(formatCliCommand("dewbot doctor --fix", { DEWBOT_PROFILE: "Default" })).toBe(
      "dewbot doctor --fix",
    );
  });

  it("returns command unchanged when profile is invalid", () => {
    expect(formatCliCommand("dewbot doctor --fix", { DEWBOT_PROFILE: "bad profile" })).toBe(
      "dewbot doctor --fix",
    );
  });

  it("returns command unchanged when --profile is already present", () => {
    expect(formatCliCommand("dewbot --profile work doctor --fix", { DEWBOT_PROFILE: "work" })).toBe(
      "dewbot --profile work doctor --fix",
    );
  });

  it("returns command unchanged when --dev is already present", () => {
    expect(formatCliCommand("dewbot --dev doctor", { DEWBOT_PROFILE: "dev" })).toBe(
      "dewbot --dev doctor",
    );
  });

  it("inserts --profile flag when profile is set", () => {
    expect(formatCliCommand("dewbot doctor --fix", { DEWBOT_PROFILE: "work" })).toBe(
      "dewbot --profile work doctor --fix",
    );
  });

  it("trims whitespace from profile", () => {
    expect(formatCliCommand("dewbot doctor --fix", { DEWBOT_PROFILE: "  jbdewbot  " })).toBe(
      "dewbot --profile jbdewbot doctor --fix",
    );
  });

  it("handles command with no args after dewbot", () => {
    expect(formatCliCommand("dewbot", { DEWBOT_PROFILE: "test" })).toBe("dewbot --profile test");
  });

  it("handles pnpm wrapper", () => {
    expect(formatCliCommand("pnpm dewbot doctor", { DEWBOT_PROFILE: "work" })).toBe(
      "pnpm dewbot --profile work doctor",
    );
  });
});
