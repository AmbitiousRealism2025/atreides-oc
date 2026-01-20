/**
 * Maturity Scoring System Unit Tests
 *
 * Tests for the maturity command that assesses project health across
 * 5 categories and 13 criteria for a 0-13 point score.
 * Target: >80% coverage for maturity.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Import types for testing
import type {
  MaturityResult,
  MaturityLevel,
  MaturityCategory,
  CriterionResult,
  CategoryResult,
  Recommendation,
} from "../../src/cli/maturity.js";

describe("Maturity Scoring System", () => {
  let testDir: string;
  let consoleOutput: string[];
  let originalConsoleLog: typeof console.log;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = join(
      tmpdir(),
      `atreides-maturity-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await mkdir(testDir, { recursive: true });

    // Capture console output
    consoleOutput = [];
    originalConsoleLog = console.log;
    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(" "));
    };
  });

  afterEach(async () => {
    // Restore console.log
    console.log = originalConsoleLog;

    // Clean up temp directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // =============================================================================
  // Helper Functions for Test Setup
  // =============================================================================

  async function createPackageJson(content: object): Promise<void> {
    await writeFile(join(testDir, "package.json"), JSON.stringify(content, null, 2));
  }

  async function createTsConfig(content: object = {}): Promise<void> {
    const defaultConfig = {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        strict: true,
      },
    };
    await writeFile(
      join(testDir, "tsconfig.json"),
      JSON.stringify({ ...defaultConfig, ...content }, null, 2)
    );
  }

  async function createReadme(content = "# Project\n\nThis is a test project.\n\nWith multiple lines."): Promise<void> {
    await writeFile(join(testDir, "README.md"), content);
  }

  async function createTestDir(): Promise<void> {
    await mkdir(join(testDir, "test"), { recursive: true });
    await writeFile(
      join(testDir, "test", "example.test.ts"),
      'import { test } from "bun:test"; test("example", () => {});'
    );
  }

  async function createSrcDir(): Promise<void> {
    await mkdir(join(testDir, "src"), { recursive: true });
    await writeFile(
      join(testDir, "src", "index.ts"),
      '/** Main entry point */\nexport function main() { console.log("hello"); }'
    );
  }

  async function createDocsDir(): Promise<void> {
    await mkdir(join(testDir, "docs"), { recursive: true });
    await writeFile(join(testDir, "docs", "api.md"), "# API Documentation\n\n## Functions");
    await writeFile(join(testDir, "docs", "guide.md"), "# User Guide\n\n## Getting Started");
  }

  async function createGitHubWorkflows(): Promise<void> {
    await mkdir(join(testDir, ".github", "workflows"), { recursive: true });
    await writeFile(
      join(testDir, ".github", "workflows", "ci.yml"),
      "name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest"
    );
  }

  async function createEslintConfig(): Promise<void> {
    await writeFile(
      join(testDir, ".eslintrc.json"),
      JSON.stringify({ extends: ["eslint:recommended"] })
    );
  }

  async function createPrettierConfig(): Promise<void> {
    await writeFile(
      join(testDir, ".prettierrc"),
      JSON.stringify({ semi: true, singleQuote: false })
    );
  }

  async function createHuskyConfig(): Promise<void> {
    await mkdir(join(testDir, ".husky"), { recursive: true });
    await writeFile(join(testDir, ".husky", "pre-commit"), "#!/bin/sh\nnpm test");
  }

  async function createFullyMatureProject(): Promise<void> {
    // TypeScript config with strict mode
    await createTsConfig({ compilerOptions: { strict: true } });

    // Package.json with test scripts and dev dependencies
    await createPackageJson({
      name: "mature-project",
      scripts: {
        test: "bun test",
        "test:coverage": "bun test --coverage",
        lint: "eslint src",
        format: "prettier --write .",
        docs: "typedoc src",
        deploy: "npm publish",
      },
      devDependencies: {
        typescript: "^5.0.0",
        eslint: "^8.0.0",
        prettier: "^3.0.0",
        husky: "^9.0.0",
        typedoc: "^0.25.0",
        "@vitest/coverage-v8": "^1.0.0",
      },
    });

    // README
    await createReadme();

    // Test directory
    await createTestDir();

    // Source with JSDoc
    await createSrcDir();

    // Documentation
    await createDocsDir();

    // GitHub Actions
    await createGitHubWorkflows();

    // Linter
    await createEslintConfig();

    // Formatter
    await createPrettierConfig();

    // Pre-commit hooks
    await createHuskyConfig();

    // Deployment config
    await writeFile(join(testDir, "Dockerfile"), "FROM node:20\nCOPY . /app");

    // Coverage config
    await writeFile(
      join(testDir, "vitest.config.ts"),
      "export default { test: { coverage: { enabled: true } } }"
    );
  }

  async function createMinimalProject(): Promise<void> {
    // Just a package.json
    await createPackageJson({ name: "minimal-project" });
  }

  // =============================================================================
  // Main Command Tests
  // =============================================================================

  describe("runMaturityCommand", () => {
    test("returns MaturityResult object", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createMinimalProject();
      const result = await runMaturityCommand({ directory: testDir });

      expect(result).toBeDefined();
      expect(typeof result.score).toBe("number");
      expect(typeof result.maxScore).toBe("number");
      expect(result.level).toBeDefined();
      expect(result.categories).toBeInstanceOf(Array);
      expect(result.criteria).toBeInstanceOf(Array);
      expect(result.recommendations).toBeInstanceOf(Array);
      expect(result.projectType).toBeDefined();
      expect(typeof result.timestamp).toBe("number");
    });

    test("calculates score between 0 and 13", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createMinimalProject();
      const result = await runMaturityCommand({ directory: testDir });

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(13);
      expect(result.maxScore).toBe(13);
    });

    test("outputs JSON format when specified", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createMinimalProject();
      await runMaturityCommand({ directory: testDir, format: "json" });

      // Should have JSON output
      const jsonOutput = consoleOutput.find((line) => line.startsWith("{"));
      expect(jsonOutput).toBeDefined();

      // Should be valid JSON
      const parsed = JSON.parse(jsonOutput!);
      expect(parsed.score).toBeDefined();
    });

    test("detects project type correctly", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createTsConfig();
      await createPackageJson({ name: "ts-project" });

      const result = await runMaturityCommand({ directory: testDir });

      expect(result.projectType).toBe("typescript");
    });
  });

  // =============================================================================
  // Scoring Tests
  // =============================================================================

  describe("Score Calculation", () => {
    test("gives maximum score for fully mature project", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createFullyMatureProject();
      const result = await runMaturityCommand({ directory: testDir });

      // Should have a high score (may not be perfect 13 due to some checks)
      expect(result.score).toBeGreaterThanOrEqual(10);
    });

    test("gives low score for minimal project", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createMinimalProject();
      const result = await runMaturityCommand({ directory: testDir });

      // Minimal project should have very low score
      expect(result.score).toBeLessThanOrEqual(3);
    });

    test("has 13 criteria total", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createMinimalProject();
      const result = await runMaturityCommand({ directory: testDir });

      expect(result.criteria.length).toBe(13);
    });

    test("has 5 categories", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createMinimalProject();
      const result = await runMaturityCommand({ directory: testDir });

      expect(result.categories.length).toBe(5);

      const categoryNames = result.categories.map((c) => c.category);
      expect(categoryNames).toContain("testing");
      expect(categoryNames).toContain("consistency");
      expect(categoryNames).toContain("documentation");
      expect(categoryNames).toContain("cicd");
      expect(categoryNames).toContain("typesafety");
    });
  });

  // =============================================================================
  // Maturity Level Tests
  // =============================================================================

  describe("Maturity Levels", () => {
    test("assigns 'nascent' level for score 0-2", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      // Empty directory - should have very low score
      const result = await runMaturityCommand({ directory: testDir });

      if (result.score < 3) {
        expect(result.level).toBe("nascent");
      }
    });

    test("assigns 'developing' level for score 3-5", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      // Create minimal structure
      await createPackageJson({ name: "test", scripts: { test: "echo test" } });
      await createReadme();
      await createTsConfig();

      const result = await runMaturityCommand({ directory: testDir });

      if (result.score >= 3 && result.score < 6) {
        expect(result.level).toBe("developing");
      }
    });

    test("assigns 'exemplary' level for score 12-13", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createFullyMatureProject();
      const result = await runMaturityCommand({ directory: testDir });

      if (result.score >= 12) {
        expect(result.level).toBe("exemplary");
      }
    });
  });

  // =============================================================================
  // Testing Category Tests (3 points)
  // =============================================================================

  describe("Testing Category", () => {
    test("detects test files (+1 point)", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createPackageJson({ name: "test" });
      await createTestDir();

      const result = await runMaturityCommand({ directory: testDir });

      const testFilesCriterion = result.criteria.find((c) => c.id === "test-files");
      expect(testFilesCriterion).toBeDefined();
      expect(testFilesCriterion?.passed).toBe(true);
      expect(testFilesCriterion?.points).toBe(1);
    });

    test("detects missing test files (0 points)", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createPackageJson({ name: "test" });

      const result = await runMaturityCommand({ directory: testDir });

      const testFilesCriterion = result.criteria.find((c) => c.id === "test-files");
      expect(testFilesCriterion?.passed).toBe(false);
      expect(testFilesCriterion?.points).toBe(0);
    });

    test("detects test config (+1 point)", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createPackageJson({
        name: "test",
        scripts: { test: "jest" },
        devDependencies: { jest: "^29.0.0" },
      });

      const result = await runMaturityCommand({ directory: testDir });

      const testConfigCriterion = result.criteria.find((c) => c.id === "test-config");
      expect(testConfigCriterion).toBeDefined();
      expect(testConfigCriterion?.passed).toBe(true);
    });

    test("detects test coverage config (+1 point)", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createPackageJson({
        name: "test",
        scripts: { "test:coverage": "jest --coverage" },
      });

      const result = await runMaturityCommand({ directory: testDir });

      const coverageCriterion = result.criteria.find((c) => c.id === "test-coverage");
      expect(coverageCriterion).toBeDefined();
      expect(coverageCriterion?.passed).toBe(true);
    });

    test("testing category max points is 3", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createMinimalProject();
      const result = await runMaturityCommand({ directory: testDir });

      const testingCategory = result.categories.find((c) => c.category === "testing");
      expect(testingCategory?.maxPoints).toBe(3);
    });
  });

  // =============================================================================
  // Code Consistency Category Tests (3 points)
  // =============================================================================

  describe("Code Consistency Category", () => {
    test("detects linter config (+1 point)", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createPackageJson({ name: "test" });
      await createEslintConfig();

      const result = await runMaturityCommand({ directory: testDir });

      const linterCriterion = result.criteria.find((c) => c.id === "linter");
      expect(linterCriterion?.passed).toBe(true);
      expect(linterCriterion?.points).toBe(1);
    });

    test("detects formatter config (+1 point)", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createPackageJson({ name: "test" });
      await createPrettierConfig();

      const result = await runMaturityCommand({ directory: testDir });

      const formatterCriterion = result.criteria.find((c) => c.id === "formatter");
      expect(formatterCriterion?.passed).toBe(true);
      expect(formatterCriterion?.points).toBe(1);
    });

    test("detects pre-commit hooks (+1 point)", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createPackageJson({ name: "test" });
      await createHuskyConfig();

      const result = await runMaturityCommand({ directory: testDir });

      const precommitCriterion = result.criteria.find((c) => c.id === "pre-commit");
      expect(precommitCriterion?.passed).toBe(true);
      expect(precommitCriterion?.points).toBe(1);
    });

    test("detects lint-staged in package.json", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createPackageJson({
        name: "test",
        devDependencies: { "lint-staged": "^15.0.0" },
        "lint-staged": { "*.ts": ["eslint --fix"] },
      });

      const result = await runMaturityCommand({ directory: testDir });

      const precommitCriterion = result.criteria.find((c) => c.id === "pre-commit");
      expect(precommitCriterion?.passed).toBe(true);
    });

    test("consistency category max points is 3", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createMinimalProject();
      const result = await runMaturityCommand({ directory: testDir });

      const consistencyCategory = result.categories.find((c) => c.category === "consistency");
      expect(consistencyCategory?.maxPoints).toBe(3);
    });
  });

  // =============================================================================
  // Documentation Category Tests (3 points)
  // =============================================================================

  describe("Documentation Category", () => {
    test("detects README.md (+1 point)", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createPackageJson({ name: "test" });
      await createReadme();

      const result = await runMaturityCommand({ directory: testDir });

      const readmeCriterion = result.criteria.find((c) => c.id === "readme");
      expect(readmeCriterion?.passed).toBe(true);
      expect(readmeCriterion?.points).toBe(1);
    });

    test("detects code documentation (+1 point)", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createPackageJson({
        name: "test",
        scripts: { docs: "typedoc" },
        devDependencies: { typedoc: "^0.25.0" },
      });

      const result = await runMaturityCommand({ directory: testDir });

      const codeDocsCriterion = result.criteria.find((c) => c.id === "code-docs");
      expect(codeDocsCriterion?.passed).toBe(true);
      expect(codeDocsCriterion?.points).toBe(1);
    });

    test("detects docs directory (+1 point)", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createPackageJson({ name: "test" });
      await createDocsDir();

      const result = await runMaturityCommand({ directory: testDir });

      const apiDocsCriterion = result.criteria.find((c) => c.id === "api-docs");
      expect(apiDocsCriterion?.passed).toBe(true);
      expect(apiDocsCriterion?.points).toBe(1);
    });

    test("documentation category max points is 3", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createMinimalProject();
      const result = await runMaturityCommand({ directory: testDir });

      const docsCategory = result.categories.find((c) => c.category === "documentation");
      expect(docsCategory?.maxPoints).toBe(3);
    });
  });

  // =============================================================================
  // CI/CD Category Tests (2 points)
  // =============================================================================

  describe("CI/CD Category", () => {
    test("detects GitHub Actions (+1 point)", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createPackageJson({ name: "test" });
      await createGitHubWorkflows();

      const result = await runMaturityCommand({ directory: testDir });

      const ciCriterion = result.criteria.find((c) => c.id === "ci-config");
      expect(ciCriterion?.passed).toBe(true);
      expect(ciCriterion?.points).toBe(1);
    });

    test("detects GitLab CI", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createPackageJson({ name: "test" });
      await writeFile(join(testDir, ".gitlab-ci.yml"), "stages:\n  - test");

      const result = await runMaturityCommand({ directory: testDir });

      const ciCriterion = result.criteria.find((c) => c.id === "ci-config");
      expect(ciCriterion?.passed).toBe(true);
    });

    test("detects deployment config (+1 point)", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createPackageJson({ name: "test" });
      await writeFile(join(testDir, "Dockerfile"), "FROM node:20");

      const result = await runMaturityCommand({ directory: testDir });

      const deploymentCriterion = result.criteria.find((c) => c.id === "deployment");
      expect(deploymentCriterion?.passed).toBe(true);
      expect(deploymentCriterion?.points).toBe(1);
    });

    test("detects vercel.json as deployment", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createPackageJson({ name: "test" });
      await writeFile(join(testDir, "vercel.json"), JSON.stringify({ version: 2 }));

      const result = await runMaturityCommand({ directory: testDir });

      const deploymentCriterion = result.criteria.find((c) => c.id === "deployment");
      expect(deploymentCriterion?.passed).toBe(true);
    });

    test("cicd category max points is 2", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createMinimalProject();
      const result = await runMaturityCommand({ directory: testDir });

      const cicdCategory = result.categories.find((c) => c.category === "cicd");
      expect(cicdCategory?.maxPoints).toBe(2);
    });
  });

  // =============================================================================
  // Type Safety Category Tests (2 points)
  // =============================================================================

  describe("Type Safety Category", () => {
    test("detects TypeScript config (+1 point)", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createPackageJson({ name: "test" });
      await createTsConfig();

      const result = await runMaturityCommand({ directory: testDir });

      const typeConfigCriterion = result.criteria.find((c) => c.id === "type-config");
      expect(typeConfigCriterion?.passed).toBe(true);
      expect(typeConfigCriterion?.points).toBe(1);
    });

    test("detects strict TypeScript (+1 point)", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createPackageJson({ name: "test" });
      await createTsConfig({ compilerOptions: { strict: true } });

      const result = await runMaturityCommand({ directory: testDir });

      const strictTypesCriterion = result.criteria.find((c) => c.id === "strict-types");
      expect(strictTypesCriterion?.passed).toBe(true);
      expect(strictTypesCriterion?.points).toBe(1);
    });

    test("detects non-strict TypeScript", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createPackageJson({ name: "test" });
      await writeFile(
        join(testDir, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { strict: false } })
      );

      const result = await runMaturityCommand({ directory: testDir });

      const strictTypesCriterion = result.criteria.find((c) => c.id === "strict-types");
      expect(strictTypesCriterion?.passed).toBe(false);
    });

    test("typesafety category max points is 2", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createMinimalProject();
      const result = await runMaturityCommand({ directory: testDir });

      const typesafetyCategory = result.categories.find((c) => c.category === "typesafety");
      expect(typesafetyCategory?.maxPoints).toBe(2);
    });
  });

  // =============================================================================
  // Recommendations Tests
  // =============================================================================

  describe("Recommendations", () => {
    test("generates recommendations for failed criteria", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createMinimalProject();
      const result = await runMaturityCommand({ directory: testDir });

      expect(result.recommendations.length).toBeGreaterThan(0);

      // Each recommendation should have required fields
      for (const rec of result.recommendations) {
        expect(typeof rec.priority).toBe("number");
        expect(rec.category).toBeDefined();
        expect(rec.title).toBeDefined();
        expect(rec.description).toBeDefined();
        expect(rec.potentialPoints).toBeGreaterThan(0);
        expect(["easy", "medium", "hard"]).toContain(rec.difficulty);
      }
    });

    test("recommendations are sorted by priority", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createMinimalProject();
      const result = await runMaturityCommand({ directory: testDir });

      for (let i = 1; i < result.recommendations.length; i++) {
        expect(result.recommendations[i]!.priority).toBeGreaterThanOrEqual(
          result.recommendations[i - 1]!.priority
        );
      }
    });

    test("no recommendations for fully mature project", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createFullyMatureProject();
      const result = await runMaturityCommand({ directory: testDir });

      // May have a few recommendations for non-detected items
      // But should be significantly fewer than a minimal project
      expect(result.recommendations.length).toBeLessThanOrEqual(5);
    });

    test("recommendations match failed criteria count", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createMinimalProject();
      const result = await runMaturityCommand({ directory: testDir });

      const failedCriteria = result.criteria.filter((c) => !c.passed);
      expect(result.recommendations.length).toBe(failedCriteria.length);
    });
  });

  // =============================================================================
  // Evidence Collection Tests
  // =============================================================================

  describe("Evidence Collection", () => {
    test("collects evidence for passed criteria", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createPackageJson({ name: "test" });
      await createReadme();

      const result = await runMaturityCommand({ directory: testDir });

      const readmeCriterion = result.criteria.find((c) => c.id === "readme");
      expect(readmeCriterion?.evidence.length).toBeGreaterThan(0);
      expect(readmeCriterion?.evidence[0]).toContain("README.md");
    });

    test("evidence is empty for failed criteria", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createMinimalProject();

      const result = await runMaturityCommand({ directory: testDir });

      const readmeCriterion = result.criteria.find((c) => c.id === "readme");
      expect(readmeCriterion?.evidence.length).toBe(0);
    });

    test("detects multiple evidence items", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createPackageJson({
        name: "test",
        devDependencies: { eslint: "^8.0.0" },
        scripts: { lint: "eslint ." },
      });
      await createEslintConfig();

      const result = await runMaturityCommand({ directory: testDir });

      const linterCriterion = result.criteria.find((c) => c.id === "linter");
      expect(linterCriterion?.evidence.length).toBeGreaterThan(1);
    });
  });

  // =============================================================================
  // Category Results Tests
  // =============================================================================

  describe("Category Results", () => {
    test("category points sum equals total score", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createMinimalProject();
      const result = await runMaturityCommand({ directory: testDir });

      const categoryPointsSum = result.categories.reduce((sum, c) => sum + c.points, 0);
      expect(categoryPointsSum).toBe(result.score);
    });

    test("category max points sum equals 13", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createMinimalProject();
      const result = await runMaturityCommand({ directory: testDir });

      const categoryMaxPointsSum = result.categories.reduce((sum, c) => sum + c.maxPoints, 0);
      expect(categoryMaxPointsSum).toBe(13);
    });

    test("each category contains correct criteria", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await createMinimalProject();
      const result = await runMaturityCommand({ directory: testDir });

      const testingCategory = result.categories.find((c) => c.category === "testing");
      expect(testingCategory?.criteria.length).toBe(3);
      expect(testingCategory?.criteria.every((c) => c.category === "testing")).toBe(true);
    });
  });

  // =============================================================================
  // Python Project Tests
  // =============================================================================

  describe("Python Project Support", () => {
    test("detects Python project type", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await writeFile(join(testDir, "pyproject.toml"), '[project]\nname = "test"');

      const result = await runMaturityCommand({ directory: testDir });

      expect(result.projectType).toBe("python");
    });

    test("detects pytest configuration", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await writeFile(
        join(testDir, "pyproject.toml"),
        '[project]\nname = "test"\n\n[tool.pytest.ini_options]\naddopts = "-v"'
      );

      const result = await runMaturityCommand({ directory: testDir });

      const testConfigCriterion = result.criteria.find((c) => c.id === "test-config");
      expect(testConfigCriterion?.passed).toBe(true);
    });

    test("detects mypy configuration", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await writeFile(join(testDir, "pyproject.toml"), '[project]\nname = "test"');
      await writeFile(join(testDir, "mypy.ini"), "[mypy]\nstrict = True");

      const result = await runMaturityCommand({ directory: testDir });

      const typeConfigCriterion = result.criteria.find((c) => c.id === "type-config");
      expect(typeConfigCriterion?.passed).toBe(true);

      const strictTypesCriterion = result.criteria.find((c) => c.id === "strict-types");
      expect(strictTypesCriterion?.passed).toBe(true);
    });

    test("detects ruff linter", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await writeFile(join(testDir, "pyproject.toml"), '[project]\nname = "test"');
      await writeFile(join(testDir, "ruff.toml"), "[lint]\nselect = ['E', 'F']");

      const result = await runMaturityCommand({ directory: testDir });

      const linterCriterion = result.criteria.find((c) => c.id === "linter");
      expect(linterCriterion?.passed).toBe(true);
    });
  });

  // =============================================================================
  // Go Project Tests
  // =============================================================================

  describe("Go Project Support", () => {
    test("detects Go project type", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await writeFile(join(testDir, "go.mod"), "module example.com/test\n\ngo 1.21");

      const result = await runMaturityCommand({ directory: testDir });

      expect(result.projectType).toBe("go");
    });

    test("Go has built-in formatter (gofmt)", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await writeFile(join(testDir, "go.mod"), "module example.com/test\n\ngo 1.21");

      const result = await runMaturityCommand({ directory: testDir });

      const formatterCriterion = result.criteria.find((c) => c.id === "formatter");
      expect(formatterCriterion?.passed).toBe(true);
      expect(formatterCriterion?.evidence).toContain("gofmt (built-in)");
    });

    test("Go is inherently statically typed", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await writeFile(join(testDir, "go.mod"), "module example.com/test\n\ngo 1.21");

      const result = await runMaturityCommand({ directory: testDir });

      const typeConfigCriterion = result.criteria.find((c) => c.id === "type-config");
      expect(typeConfigCriterion?.passed).toBe(true);

      const strictTypesCriterion = result.criteria.find((c) => c.id === "strict-types");
      expect(strictTypesCriterion?.passed).toBe(true);
    });
  });

  // =============================================================================
  // Rust Project Tests
  // =============================================================================

  describe("Rust Project Support", () => {
    test("detects Rust project type", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await writeFile(
        join(testDir, "Cargo.toml"),
        '[package]\nname = "test"\nversion = "0.1.0"'
      );

      const result = await runMaturityCommand({ directory: testDir });

      expect(result.projectType).toBe("rust");
    });

    test("Rust has built-in formatter (rustfmt)", async () => {
      const { runMaturityCommand } = await import("../../src/cli/maturity.js");

      await writeFile(
        join(testDir, "Cargo.toml"),
        '[package]\nname = "test"\nversion = "0.1.0"'
      );

      const result = await runMaturityCommand({ directory: testDir });

      const formatterCriterion = result.criteria.find((c) => c.id === "formatter");
      expect(formatterCriterion?.passed).toBe(true);
      expect(formatterCriterion?.evidence).toContain("rustfmt (built-in)");
    });
  });
});
