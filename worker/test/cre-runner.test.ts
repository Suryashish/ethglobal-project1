import { describe, expect, it } from "vitest";
import { buildArgs, classifyLine } from "../src/cre-runner.js";
import { loadCreConfig, loadMirrorConfig, ConfigError } from "../src/config.js";

describe("cre-runner", () => {
  it("builds non-interactive broadcast args", () => {
    const c = loadCreConfig({ CRE_PROJECT_DIR: "/x" }, "/home/u");
    expect(c.bin).toBe("/home/u/.cre/bin/cre");
    const a = buildArgs(c);
    expect(a).toEqual(expect.arrayContaining(["workflow", "simulate", "./workflow", "--broadcast", "--non-interactive", "--trigger-index", "0", "-T", "staging-settings"]));
  });
  it("classifies lines", () => {
    expect(classifyLine("Error: not logged in, run cre login")).toBe("login");
    expect(classifyLine("Releasing seal abc")).toBe("highlight");
    expect(classifyLine("0x" + "a".repeat(64))).toBe("highlight");
    expect(classifyLine("compiling...")).toBe("plain");
  });
});

describe("config", () => {
  it("reports all missing vars without leaking values", () => {
    try {
      loadMirrorConfig({ MIRROR_PRIVATE_KEY: "0xshort" });
      throw new Error("should fail");
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const m = (e as Error).message;
      expect(m).toMatch(/VERIFIER_ADDRESS is missing/);
      expect(m).toMatch(/SILENT_RELEASE_ADDRESS is missing/);
      expect(m).toMatch(/START_BLOCK is missing/);
      expect(m).not.toMatch(/0xshort/);
    }
  });
});
