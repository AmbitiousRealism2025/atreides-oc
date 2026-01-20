/**
 * Version Module Unit Tests
 *
 * Tests for version checking and comparison utilities.
 */

import { describe, test, expect } from "bun:test";
import {
  getCurrentVersion,
  compareVersions,
  formatVersionUpdate,
} from "../../src/lib/version.js";
import { PACKAGE_VERSION } from "../../src/lib/constants.js";

describe("Version Module", () => {
  // ===========================================================================
  // getCurrentVersion
  // ===========================================================================

  describe("getCurrentVersion", () => {
    test("returns current package version", () => {
      const version = getCurrentVersion();
      expect(version).toBe(PACKAGE_VERSION);
    });

    test("returns valid semver format", () => {
      const version = getCurrentVersion();
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  // ===========================================================================
  // compareVersions
  // ===========================================================================

  describe("compareVersions", () => {
    test("returns 0 for equal versions", () => {
      expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
      expect(compareVersions("2.5.3", "2.5.3")).toBe(0);
    });

    test("returns -1 when a < b (major)", () => {
      expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
      expect(compareVersions("0.9.9", "1.0.0")).toBe(-1);
    });

    test("returns 1 when a > b (major)", () => {
      expect(compareVersions("2.0.0", "1.0.0")).toBe(1);
      expect(compareVersions("10.0.0", "9.0.0")).toBe(1);
    });

    test("returns -1 when a < b (minor)", () => {
      expect(compareVersions("1.0.0", "1.1.0")).toBe(-1);
      expect(compareVersions("1.9.0", "1.10.0")).toBe(-1);
    });

    test("returns 1 when a > b (minor)", () => {
      expect(compareVersions("1.1.0", "1.0.0")).toBe(1);
      expect(compareVersions("1.10.0", "1.9.0")).toBe(1);
    });

    test("returns -1 when a < b (patch)", () => {
      expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
      expect(compareVersions("1.0.9", "1.0.10")).toBe(-1);
    });

    test("returns 1 when a > b (patch)", () => {
      expect(compareVersions("1.0.1", "1.0.0")).toBe(1);
      expect(compareVersions("1.0.10", "1.0.9")).toBe(1);
    });

    test("handles different length versions", () => {
      expect(compareVersions("1.0", "1.0.0")).toBe(0);
      expect(compareVersions("1.0.0", "1.0")).toBe(0);
      expect(compareVersions("1", "1.0.0")).toBe(0);
    });

    test("compares complex versions correctly", () => {
      expect(compareVersions("1.2.3", "1.2.4")).toBe(-1);
      expect(compareVersions("1.2.10", "1.2.9")).toBe(1);
      expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
      expect(compareVersions("10.20.30", "10.20.30")).toBe(0);
    });
  });

  // ===========================================================================
  // formatVersionUpdate
  // ===========================================================================

  describe("formatVersionUpdate", () => {
    test("formats version update string", () => {
      const result = formatVersionUpdate("1.0.0", "2.0.0");
      expect(result).toBe("1.0.0 → 2.0.0");
    });

    test("formats same version", () => {
      const result = formatVersionUpdate("1.0.0", "1.0.0");
      expect(result).toBe("1.0.0 → 1.0.0");
    });

    test("handles any version format", () => {
      const result = formatVersionUpdate("0.0.1", "10.20.30");
      expect(result).toBe("0.0.1 → 10.20.30");
    });
  });
});
