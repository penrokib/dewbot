import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveGatewayStateDir } from "./paths.js";

describe("resolveGatewayStateDir", () => {
  it("uses the default state dir when no overrides are set", () => {
    const env = { HOME: "/Users/test" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".dewbot"));
  });

  it("appends the profile suffix when set", () => {
    const env = { HOME: "/Users/test", DEWBOT_PROFILE: "rescue" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".dewbot-rescue"));
  });

  it("treats default profiles as the base state dir", () => {
    const env = { HOME: "/Users/test", DEWBOT_PROFILE: "Default" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".dewbot"));
  });

  it("uses DEWBOT_STATE_DIR when provided", () => {
    const env = { HOME: "/Users/test", DEWBOT_STATE_DIR: "/var/lib/dewbot" };
    expect(resolveGatewayStateDir(env)).toBe(path.resolve("/var/lib/dewbot"));
  });

  it("expands ~ in DEWBOT_STATE_DIR", () => {
    const env = { HOME: "/Users/test", DEWBOT_STATE_DIR: "~/dewbot-state" };
    expect(resolveGatewayStateDir(env)).toBe(path.resolve("/Users/test/dewbot-state"));
  });

  it("preserves Windows absolute paths without HOME", () => {
    const env = { DEWBOT_STATE_DIR: "C:\\State\\dewbot" };
    expect(resolveGatewayStateDir(env)).toBe("C:\\State\\dewbot");
  });
});
