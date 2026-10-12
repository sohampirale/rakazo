import { describe, expect, it } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  resolveAntigravityBin,
  resolveProjectPath,
  getAntigravityTaskStatus,
} from "./antigravity-service.js";

describe("Antigravity Service Unit Tests", () => {
  it("resolves the agy binary location", () => {
    const bin = resolveAntigravityBin();
    expect(bin).toBeTruthy();
    expect(bin).toContain("agy");
  });

  it("resolves relative and tilde project paths to absolute paths", () => {
    const home = homedir();
    expect(resolveProjectPath("~/coding/proj")).toBe(join(home, "coding/proj"));
    expect(resolveProjectPath("/tmp/test-repo")).toBe("/tmp/test-repo");
  });

  it("returns found: false for unknown job IDs", () => {
    const status = getAntigravityTaskStatus("non_existent_job_12345");
    expect(status.found).toBe(false);
  });
});
