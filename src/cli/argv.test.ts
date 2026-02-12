import { describe, expect, it } from "vitest";
import {
  buildParseArgv,
  getFlagValue,
  getCommandPath,
  getPrimaryCommand,
  getPositiveIntFlagValue,
  getVerboseFlag,
  hasHelpOrVersion,
  hasFlag,
  shouldMigrateState,
  shouldMigrateStateFromPath,
} from "./argv.js";

describe("argv helpers", () => {
  it("detects help/version flags", () => {
    expect(hasHelpOrVersion(["node", "dewbot", "--help"])).toBe(true);
    expect(hasHelpOrVersion(["node", "dewbot", "-V"])).toBe(true);
    expect(hasHelpOrVersion(["node", "dewbot", "status"])).toBe(false);
  });

  it("extracts command path ignoring flags and terminator", () => {
    expect(getCommandPath(["node", "dewbot", "status", "--json"], 2)).toEqual(["status"]);
    expect(getCommandPath(["node", "dewbot", "agents", "list"], 2)).toEqual(["agents", "list"]);
    expect(getCommandPath(["node", "dewbot", "status", "--", "ignored"], 2)).toEqual(["status"]);
  });

  it("returns primary command", () => {
    expect(getPrimaryCommand(["node", "dewbot", "agents", "list"])).toBe("agents");
    expect(getPrimaryCommand(["node", "dewbot"])).toBeNull();
  });

  it("parses boolean flags and ignores terminator", () => {
    expect(hasFlag(["node", "dewbot", "status", "--json"], "--json")).toBe(true);
    expect(hasFlag(["node", "dewbot", "--", "--json"], "--json")).toBe(false);
  });

  it("extracts flag values with equals and missing values", () => {
    expect(getFlagValue(["node", "dewbot", "status", "--timeout", "5000"], "--timeout")).toBe(
      "5000",
    );
    expect(getFlagValue(["node", "dewbot", "status", "--timeout=2500"], "--timeout")).toBe("2500");
    expect(getFlagValue(["node", "dewbot", "status", "--timeout"], "--timeout")).toBeNull();
    expect(getFlagValue(["node", "dewbot", "status", "--timeout", "--json"], "--timeout")).toBe(
      null,
    );
    expect(getFlagValue(["node", "dewbot", "--", "--timeout=99"], "--timeout")).toBeUndefined();
  });

  it("parses verbose flags", () => {
    expect(getVerboseFlag(["node", "dewbot", "status", "--verbose"])).toBe(true);
    expect(getVerboseFlag(["node", "dewbot", "status", "--debug"])).toBe(false);
    expect(getVerboseFlag(["node", "dewbot", "status", "--debug"], { includeDebug: true })).toBe(
      true,
    );
  });

  it("parses positive integer flag values", () => {
    expect(getPositiveIntFlagValue(["node", "dewbot", "status"], "--timeout")).toBeUndefined();
    expect(
      getPositiveIntFlagValue(["node", "dewbot", "status", "--timeout"], "--timeout"),
    ).toBeNull();
    expect(
      getPositiveIntFlagValue(["node", "dewbot", "status", "--timeout", "5000"], "--timeout"),
    ).toBe(5000);
    expect(
      getPositiveIntFlagValue(["node", "dewbot", "status", "--timeout", "nope"], "--timeout"),
    ).toBeUndefined();
  });

  it("builds parse argv from raw args", () => {
    const nodeArgv = buildParseArgv({
      programName: "dewbot",
      rawArgs: ["node", "dewbot", "status"],
    });
    expect(nodeArgv).toEqual(["node", "dewbot", "status"]);

    const versionedNodeArgv = buildParseArgv({
      programName: "dewbot",
      rawArgs: ["node-22", "dewbot", "status"],
    });
    expect(versionedNodeArgv).toEqual(["node-22", "dewbot", "status"]);

    const versionedNodeWindowsArgv = buildParseArgv({
      programName: "dewbot",
      rawArgs: ["node-22.2.0.exe", "dewbot", "status"],
    });
    expect(versionedNodeWindowsArgv).toEqual(["node-22.2.0.exe", "dewbot", "status"]);

    const versionedNodePatchlessArgv = buildParseArgv({
      programName: "dewbot",
      rawArgs: ["node-22.2", "dewbot", "status"],
    });
    expect(versionedNodePatchlessArgv).toEqual(["node-22.2", "dewbot", "status"]);

    const versionedNodeWindowsPatchlessArgv = buildParseArgv({
      programName: "dewbot",
      rawArgs: ["node-22.2.exe", "dewbot", "status"],
    });
    expect(versionedNodeWindowsPatchlessArgv).toEqual(["node-22.2.exe", "dewbot", "status"]);

    const versionedNodeWithPathArgv = buildParseArgv({
      programName: "dewbot",
      rawArgs: ["/usr/bin/node-22.2.0", "dewbot", "status"],
    });
    expect(versionedNodeWithPathArgv).toEqual(["/usr/bin/node-22.2.0", "dewbot", "status"]);

    const nodejsArgv = buildParseArgv({
      programName: "dewbot",
      rawArgs: ["nodejs", "dewbot", "status"],
    });
    expect(nodejsArgv).toEqual(["nodejs", "dewbot", "status"]);

    const nonVersionedNodeArgv = buildParseArgv({
      programName: "dewbot",
      rawArgs: ["node-dev", "dewbot", "status"],
    });
    expect(nonVersionedNodeArgv).toEqual(["node", "dewbot", "node-dev", "dewbot", "status"]);

    const directArgv = buildParseArgv({
      programName: "dewbot",
      rawArgs: ["dewbot", "status"],
    });
    expect(directArgv).toEqual(["node", "dewbot", "status"]);

    const bunArgv = buildParseArgv({
      programName: "dewbot",
      rawArgs: ["bun", "src/entry.ts", "status"],
    });
    expect(bunArgv).toEqual(["bun", "src/entry.ts", "status"]);
  });

  it("builds parse argv from fallback args", () => {
    const fallbackArgv = buildParseArgv({
      programName: "dewbot",
      fallbackArgv: ["status"],
    });
    expect(fallbackArgv).toEqual(["node", "dewbot", "status"]);
  });

  it("decides when to migrate state", () => {
    expect(shouldMigrateState(["node", "dewbot", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "dewbot", "health"])).toBe(false);
    expect(shouldMigrateState(["node", "dewbot", "sessions"])).toBe(false);
    expect(shouldMigrateState(["node", "dewbot", "memory", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "dewbot", "agent", "--message", "hi"])).toBe(false);
    expect(shouldMigrateState(["node", "dewbot", "agents", "list"])).toBe(true);
    expect(shouldMigrateState(["node", "dewbot", "message", "send"])).toBe(true);
  });

  it("reuses command path for migrate state decisions", () => {
    expect(shouldMigrateStateFromPath(["status"])).toBe(false);
    expect(shouldMigrateStateFromPath(["agents", "list"])).toBe(true);
  });
});
