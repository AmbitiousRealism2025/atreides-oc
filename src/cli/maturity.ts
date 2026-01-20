import { access, readdir, readFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { COLORS, ICONS, printHeader, printDivider } from "./wizard/prompts.js";
import { detectProjectType, type ProjectType } from "./project-detection.js";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Individual criterion result
 */
export interface CriterionResult {
  /** Criterion identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Category this criterion belongs to */
  category: MaturityCategory;
  /** Points earned (0 to maxPoints) */
  points: number;
  /** Maximum possible points */
  maxPoints: number;
  /** Whether criterion passed */
  passed: boolean;
  /** Evidence/files found */
  evidence: string[];
  /** Description of what was checked */
  description: string;
}

/**
 * Category-level result
 */
export interface CategoryResult {
  /** Category identifier */
  category: MaturityCategory;
  /** Human-readable category name */
  displayName: string;
  /** Total points earned in category */
  points: number;
  /** Maximum possible points in category */
  maxPoints: number;
  /** Individual criterion results */
  criteria: CriterionResult[];
  /** Category-specific recommendations */
  recommendations: string[];
}

/**
 * Overall maturity assessment result
 */
export interface MaturityResult {
  /** Total score (0-13) */
  score: number;
  /** Maximum possible score */
  maxScore: number;
  /** Maturity level classification */
  level: MaturityLevel;
  /** Results by category */
  categories: CategoryResult[];
  /** All individual criterion results */
  criteria: CriterionResult[];
  /** Prioritized recommendations for improvement */
  recommendations: Recommendation[];
  /** Detected project type */
  projectType: ProjectType;
  /** Assessment timestamp */
  timestamp: number;
}

/**
 * Maturity level classification
 */
export type MaturityLevel = "nascent" | "developing" | "established" | "mature" | "exemplary";

/**
 * Maturity categories
 */
export type MaturityCategory = "testing" | "consistency" | "documentation" | "cicd" | "typesafety";

/**
 * Improvement recommendation
 */
export interface Recommendation {
  /** Priority (1 = highest) */
  priority: number;
  /** Category this recommendation relates to */
  category: MaturityCategory;
  /** Short title */
  title: string;
  /** Detailed recommendation */
  description: string;
  /** Potential points gain */
  potentialPoints: number;
  /** Difficulty level */
  difficulty: "easy" | "medium" | "hard";
}

/**
 * Maturity command options
 */
export interface MaturityOptions {
  /** Directory to analyze (default: cwd) */
  directory?: string;
  /** Output format */
  format?: "text" | "json";
  /** Show verbose output */
  verbose?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const CATEGORY_CONFIG: Record<MaturityCategory, { displayName: string; maxPoints: number }> = {
  testing: { displayName: "Test Coverage", maxPoints: 3 },
  consistency: { displayName: "Code Consistency", maxPoints: 3 },
  documentation: { displayName: "Documentation", maxPoints: 3 },
  cicd: { displayName: "CI/CD", maxPoints: 2 },
  typesafety: { displayName: "Type Safety", maxPoints: 2 },
};

const LEVEL_THRESHOLDS: { min: number; level: MaturityLevel; description: string }[] = [
  { min: 12, level: "exemplary", description: "Industry-leading practices" },
  { min: 9, level: "mature", description: "Well-established project" },
  { min: 6, level: "established", description: "Solid foundation" },
  { min: 3, level: "developing", description: "Growing project" },
  { min: 0, level: "nascent", description: "Early stage project" },
];

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Run the maturity scoring command
 */
export async function runMaturityCommand(options: MaturityOptions = {}): Promise<MaturityResult> {
  const directory = options.directory ?? process.cwd();
  const format = options.format ?? "text";

  if (format === "text") {
    printHeader("Atreides Project Maturity Assessment");
    console.log(`${COLORS.dim}Analyzing project in: ${directory}${COLORS.reset}\n`);
  }

  // Detect project type first
  const projectDetection = await detectProjectType(directory);

  // Run all criterion checks
  const criteria = await evaluateAllCriteria(directory, projectDetection.type);

  // Calculate category results
  const categories = calculateCategoryResults(criteria);

  // Calculate overall score and level
  const score = criteria.reduce((sum, c) => sum + c.points, 0);
  const maxScore = 13;
  const level = determineLevel(score);

  // Generate recommendations
  const recommendations = generateRecommendations(categories, criteria);

  const result: MaturityResult = {
    score,
    maxScore,
    level,
    categories,
    criteria,
    recommendations,
    projectType: projectDetection.type,
    timestamp: Date.now(),
  };

  // Display results
  if (format === "text") {
    displayResults(result);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }

  return result;
}

// ============================================================================
// Criterion Evaluation
// ============================================================================

/**
 * Evaluate all 13 maturity criteria
 */
async function evaluateAllCriteria(directory: string, projectType: ProjectType): Promise<CriterionResult[]> {
  const criteria: CriterionResult[] = [];

  // Testing criteria (3 points)
  criteria.push(await checkHasTestFiles(directory, projectType));
  criteria.push(await checkHasTestConfig(directory, projectType));
  criteria.push(await checkTestCoverageConfig(directory, projectType));

  // Code consistency criteria (3 points)
  criteria.push(await checkHasLinter(directory, projectType));
  criteria.push(await checkHasFormatter(directory, projectType));
  criteria.push(await checkHasPreCommitHooks(directory));

  // Documentation criteria (3 points)
  criteria.push(await checkHasReadme(directory));
  criteria.push(await checkHasCodeDocs(directory, projectType));
  criteria.push(await checkHasApiDocs(directory));

  // CI/CD criteria (2 points)
  criteria.push(await checkHasCIConfig(directory));
  criteria.push(await checkHasDeploymentConfig(directory));

  // Type safety criteria (2 points)
  criteria.push(await checkHasTypeConfig(directory, projectType));
  criteria.push(await checkHasStrictTypes(directory, projectType));

  return criteria;
}

// ============================================================================
// Testing Criteria
// ============================================================================

async function checkHasTestFiles(directory: string, projectType: ProjectType): Promise<CriterionResult> {
  const testPatterns: Record<ProjectType, string[]> = {
    typescript: ["**/*.test.ts", "**/*.spec.ts", "**/test/**/*.ts", "**/tests/**/*.ts", "**/__tests__/**/*.ts"],
    node: ["**/*.test.js", "**/*.spec.js", "**/test/**/*.js", "**/tests/**/*.js", "**/__tests__/**/*.js"],
    python: ["**/test_*.py", "**/*_test.py", "**/tests/**/*.py", "**/test/**/*.py"],
    go: ["**/*_test.go"],
    rust: ["**/tests/**/*.rs", "src/**/*test*.rs"],
    generic: ["**/test/**", "**/tests/**", "**/*.test.*", "**/*.spec.*"],
  };

  // Note: patterns available for future use with more sophisticated file matching
  const _patterns = testPatterns[projectType] ?? testPatterns.generic;
  void _patterns; // Currently using directory-based detection
  const evidence: string[] = [];

  // Check common test directories
  const testDirs = ["test", "tests", "__tests__", "spec"];
  for (const dir of testDirs) {
    if (await directoryExists(join(directory, dir))) {
      evidence.push(dir);
    }
  }

  // Check for test files in src
  const srcDir = join(directory, "src");
  if (await directoryExists(srcDir)) {
    const testFiles = await findFilesWithPattern(srcDir, /\.(test|spec)\.(ts|js|tsx|jsx)$/);
    if (testFiles.length > 0) {
      evidence.push(...testFiles.slice(0, 3).map(f => `src/${basename(f)}`));
    }
  }

  // Check root for test files
  const rootTestFiles = await findFilesWithPattern(directory, /^test_|_test\.(py|go)$/, 1);
  evidence.push(...rootTestFiles.slice(0, 2));

  const passed = evidence.length > 0;

  return {
    id: "test-files",
    name: "Test Files Present",
    category: "testing",
    points: passed ? 1 : 0,
    maxPoints: 1,
    passed,
    evidence,
    description: "Project has test files or test directories",
  };
}

async function checkHasTestConfig(directory: string, projectType: ProjectType): Promise<CriterionResult> {
  const configFiles: Record<ProjectType, string[]> = {
    typescript: ["jest.config.ts", "jest.config.js", "vitest.config.ts", "vitest.config.js", "playwright.config.ts", ".mocharc.js", ".mocharc.json"],
    node: ["jest.config.js", "jest.config.mjs", "vitest.config.js", ".mocharc.js", ".mocharc.json", "ava.config.js"],
    python: ["pytest.ini", "pyproject.toml", "setup.cfg", "tox.ini", ".coveragerc"],
    go: ["go.mod"], // Go tests are built-in
    rust: ["Cargo.toml"], // Rust tests are built-in
    generic: ["jest.config.js", "vitest.config.js", "pytest.ini"],
  };

  const configs = configFiles[projectType] ?? configFiles.generic;
  const evidence: string[] = [];

  for (const config of configs) {
    if (await fileExists(join(directory, config))) {
      evidence.push(config);
    }
  }

  // Check package.json for test scripts
  const packageJsonPath = join(directory, "package.json");
  if (await fileExists(packageJsonPath)) {
    try {
      const content = await readFile(packageJsonPath, "utf-8");
      const pkg = JSON.parse(content);
      if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
        evidence.push("package.json:scripts.test");
      }
      if (pkg.devDependencies?.jest || pkg.devDependencies?.vitest || pkg.devDependencies?.mocha) {
        evidence.push("package.json:test framework");
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Check pyproject.toml for pytest config
  const pyprojectPath = join(directory, "pyproject.toml");
  if (await fileExists(pyprojectPath)) {
    try {
      const content = await readFile(pyprojectPath, "utf-8");
      if (content.includes("[tool.pytest") || content.includes("pytest")) {
        evidence.push("pyproject.toml:pytest");
      }
    } catch {
      // Ignore errors
    }
  }

  const passed = evidence.length > 0;

  return {
    id: "test-config",
    name: "Test Framework Configured",
    category: "testing",
    points: passed ? 1 : 0,
    maxPoints: 1,
    passed,
    evidence,
    description: "Project has test framework configuration",
  };
}

async function checkTestCoverageConfig(directory: string, _projectType: ProjectType): Promise<CriterionResult> {
  const evidence: string[] = [];

  // Check for coverage configuration files
  const coverageFiles = [".nycrc", ".nycrc.json", "nyc.config.js", ".coveragerc", "coverage.py", ".c8rc", ".c8rc.json"];
  for (const file of coverageFiles) {
    if (await fileExists(join(directory, file))) {
      evidence.push(file);
    }
  }

  // Check package.json for coverage scripts
  const packageJsonPath = join(directory, "package.json");
  if (await fileExists(packageJsonPath)) {
    try {
      const content = await readFile(packageJsonPath, "utf-8");
      const pkg = JSON.parse(content);
      if (pkg.scripts?.["test:coverage"] || pkg.scripts?.coverage) {
        evidence.push("package.json:coverage script");
      }
      if (pkg.devDependencies?.["@vitest/coverage-v8"] || pkg.devDependencies?.["@vitest/coverage-istanbul"]) {
        evidence.push("vitest coverage plugin");
      }
      if (pkg.devDependencies?.nyc || pkg.devDependencies?.c8) {
        evidence.push("coverage tool installed");
      }
      // Check jest config for coverage
      if (pkg.jest?.collectCoverage || pkg.jest?.coverageThreshold) {
        evidence.push("jest coverage config");
      }
    } catch {
      // Ignore errors
    }
  }

  // Check jest/vitest config files for coverage settings
  const configFiles = ["jest.config.ts", "jest.config.js", "vitest.config.ts", "vitest.config.js"];
  for (const config of configFiles) {
    const configPath = join(directory, config);
    if (await fileExists(configPath)) {
      try {
        const content = await readFile(configPath, "utf-8");
        if (content.includes("coverage") || content.includes("collectCoverage")) {
          evidence.push(`${config}:coverage`);
        }
      } catch {
        // Ignore errors
      }
    }
  }

  // Check pyproject.toml for coverage
  const pyprojectPath = join(directory, "pyproject.toml");
  if (await fileExists(pyprojectPath)) {
    try {
      const content = await readFile(pyprojectPath, "utf-8");
      if (content.includes("[tool.coverage") || content.includes("--cov")) {
        evidence.push("pyproject.toml:coverage");
      }
    } catch {
      // Ignore errors
    }
  }

  const passed = evidence.length > 0;

  return {
    id: "test-coverage",
    name: "Test Coverage Configured",
    category: "testing",
    points: passed ? 1 : 0,
    maxPoints: 1,
    passed,
    evidence,
    description: "Project has test coverage reporting configured",
  };
}

// ============================================================================
// Code Consistency Criteria
// ============================================================================

async function checkHasLinter(directory: string, _projectType: ProjectType): Promise<CriterionResult> {
  const linterFiles: string[] = [
    // JavaScript/TypeScript
    ".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.cjs", ".eslintrc.yaml", ".eslintrc.yml",
    "eslint.config.js", "eslint.config.mjs", "eslint.config.cjs",
    // Python
    ".pylintrc", "pylintrc", ".flake8", ".ruff.toml", "ruff.toml",
    // Go
    ".golangci.yml", ".golangci.yaml", ".golangci.json",
    // Rust
    "clippy.toml", ".clippy.toml",
    // Generic
    ".editorconfig",
  ];

  const evidence: string[] = [];

  for (const file of linterFiles) {
    if (await fileExists(join(directory, file))) {
      evidence.push(file);
    }
  }

  // Check package.json for eslint
  const packageJsonPath = join(directory, "package.json");
  if (await fileExists(packageJsonPath)) {
    try {
      const content = await readFile(packageJsonPath, "utf-8");
      const pkg = JSON.parse(content);
      if (pkg.devDependencies?.eslint || pkg.dependencies?.eslint) {
        evidence.push("eslint installed");
      }
      if (pkg.scripts?.lint) {
        evidence.push("lint script");
      }
      if (pkg.eslintConfig) {
        evidence.push("package.json:eslintConfig");
      }
    } catch {
      // Ignore errors
    }
  }

  // Check pyproject.toml for linter config
  const pyprojectPath = join(directory, "pyproject.toml");
  if (await fileExists(pyprojectPath)) {
    try {
      const content = await readFile(pyprojectPath, "utf-8");
      if (content.includes("[tool.ruff") || content.includes("[tool.pylint") || content.includes("[tool.flake8")) {
        evidence.push("pyproject.toml:linter");
      }
    } catch {
      // Ignore errors
    }
  }

  const passed = evidence.length > 0;

  return {
    id: "linter",
    name: "Linter Configured",
    category: "consistency",
    points: passed ? 1 : 0,
    maxPoints: 1,
    passed,
    evidence,
    description: "Project has a code linter configured",
  };
}

async function checkHasFormatter(directory: string, projectType: ProjectType): Promise<CriterionResult> {
  const formatterFiles: string[] = [
    // JavaScript/TypeScript
    ".prettierrc", ".prettierrc.js", ".prettierrc.json", ".prettierrc.yaml", ".prettierrc.yml",
    ".prettierrc.cjs", ".prettierrc.mjs", "prettier.config.js", "prettier.config.cjs", "prettier.config.mjs",
    // Python
    ".style.yapf", "pyproject.toml", // black config in pyproject.toml
    // Go
    // Go has gofmt built-in
    // Rust
    "rustfmt.toml", ".rustfmt.toml",
    // Generic
    ".editorconfig",
  ];

  const evidence: string[] = [];

  for (const file of formatterFiles) {
    if (file === "pyproject.toml") continue; // Handle separately
    if (await fileExists(join(directory, file))) {
      evidence.push(file);
    }
  }

  // Check package.json for prettier
  const packageJsonPath = join(directory, "package.json");
  if (await fileExists(packageJsonPath)) {
    try {
      const content = await readFile(packageJsonPath, "utf-8");
      const pkg = JSON.parse(content);
      if (pkg.devDependencies?.prettier || pkg.dependencies?.prettier) {
        evidence.push("prettier installed");
      }
      if (pkg.scripts?.format || pkg.scripts?.["fmt"]) {
        evidence.push("format script");
      }
      if (pkg.prettier) {
        evidence.push("package.json:prettier");
      }
    } catch {
      // Ignore errors
    }
  }

  // Check pyproject.toml for formatter config
  const pyprojectPath = join(directory, "pyproject.toml");
  if (await fileExists(pyprojectPath)) {
    try {
      const content = await readFile(pyprojectPath, "utf-8");
      if (content.includes("[tool.black") || content.includes("[tool.yapf") || content.includes("[tool.ruff.format")) {
        evidence.push("pyproject.toml:formatter");
      }
    } catch {
      // Ignore errors
    }
  }

  // Go has gofmt built-in
  if (projectType === "go") {
    if (await fileExists(join(directory, "go.mod"))) {
      evidence.push("gofmt (built-in)");
    }
  }

  // Rust has rustfmt
  if (projectType === "rust") {
    if (await fileExists(join(directory, "Cargo.toml"))) {
      evidence.push("rustfmt (built-in)");
    }
  }

  const passed = evidence.length > 0;

  return {
    id: "formatter",
    name: "Code Formatter Configured",
    category: "consistency",
    points: passed ? 1 : 0,
    maxPoints: 1,
    passed,
    evidence,
    description: "Project has a code formatter configured",
  };
}

async function checkHasPreCommitHooks(directory: string): Promise<CriterionResult> {
  const hookIndicators: string[] = [
    ".husky",
    ".pre-commit-config.yaml",
    ".pre-commit-config.yml",
    ".lefthook.yml",
    ".lefthook.yaml",
    "lefthook.yml",
    "lefthook.yaml",
  ];

  const evidence: string[] = [];

  for (const indicator of hookIndicators) {
    const path = join(directory, indicator);
    if (await fileExists(path) || await directoryExists(path)) {
      evidence.push(indicator);
    }
  }

  // Check package.json for husky or lint-staged
  const packageJsonPath = join(directory, "package.json");
  if (await fileExists(packageJsonPath)) {
    try {
      const content = await readFile(packageJsonPath, "utf-8");
      const pkg = JSON.parse(content);
      if (pkg.devDependencies?.husky || pkg.dependencies?.husky) {
        evidence.push("husky installed");
      }
      if (pkg.devDependencies?.["lint-staged"] || pkg["lint-staged"]) {
        evidence.push("lint-staged");
      }
      if (pkg.scripts?.prepare?.includes("husky")) {
        evidence.push("husky prepare script");
      }
    } catch {
      // Ignore errors
    }
  }

  // Check for git hooks directory
  const gitHooksDir = join(directory, ".git", "hooks");
  if (await directoryExists(gitHooksDir)) {
    const preCommitHook = join(gitHooksDir, "pre-commit");
    if (await fileExists(preCommitHook)) {
      try {
        const content = await readFile(preCommitHook, "utf-8");
        // Check if it's not a sample hook
        if (!content.includes("sample") || content.includes("husky") || content.includes("lint-staged")) {
          evidence.push(".git/hooks/pre-commit");
        }
      } catch {
        // Ignore errors
      }
    }
  }

  const passed = evidence.length > 0;

  return {
    id: "pre-commit",
    name: "Pre-commit Hooks",
    category: "consistency",
    points: passed ? 1 : 0,
    maxPoints: 1,
    passed,
    evidence,
    description: "Project has pre-commit hooks configured",
  };
}

// ============================================================================
// Documentation Criteria
// ============================================================================

async function checkHasReadme(directory: string): Promise<CriterionResult> {
  const readmeFiles = ["README.md", "README.rst", "README.txt", "README", "readme.md"];
  const evidence: string[] = [];

  for (const file of readmeFiles) {
    if (await fileExists(join(directory, file))) {
      // Check if README has substantial content
      try {
        const content = await readFile(join(directory, file), "utf-8");
        const lines = content.split("\n").filter(l => l.trim().length > 0);
        if (lines.length >= 5) {
          evidence.push(`${file} (${lines.length} lines)`);
        } else {
          evidence.push(`${file} (minimal)`);
        }
      } catch {
        evidence.push(file);
      }
      break;
    }
  }

  const passed = evidence.length > 0;

  return {
    id: "readme",
    name: "README Documentation",
    category: "documentation",
    points: passed ? 1 : 0,
    maxPoints: 1,
    passed,
    evidence,
    description: "Project has a README file with documentation",
  };
}

async function checkHasCodeDocs(directory: string, projectType: ProjectType): Promise<CriterionResult> {
  const evidence: string[] = [];

  // Check for JSDoc/TSDoc configuration
  const docConfigs = ["jsdoc.json", "jsdoc.config.json", "typedoc.json", "typedoc.config.js"];
  for (const config of docConfigs) {
    if (await fileExists(join(directory, config))) {
      evidence.push(config);
    }
  }

  // Check package.json for documentation tools
  const packageJsonPath = join(directory, "package.json");
  if (await fileExists(packageJsonPath)) {
    try {
      const content = await readFile(packageJsonPath, "utf-8");
      const pkg = JSON.parse(content);
      if (pkg.devDependencies?.jsdoc || pkg.devDependencies?.typedoc) {
        evidence.push("documentation tool installed");
      }
      if (pkg.scripts?.docs || pkg.scripts?.["build:docs"]) {
        evidence.push("docs script");
      }
    } catch {
      // Ignore errors
    }
  }

  // Check for Python documentation tools
  if (projectType === "python") {
    const pythonDocFiles = ["docs/conf.py", "mkdocs.yml", "mkdocs.yaml"];
    for (const file of pythonDocFiles) {
      if (await fileExists(join(directory, file))) {
        evidence.push(file);
      }
    }

    // Check pyproject.toml for docs
    const pyprojectPath = join(directory, "pyproject.toml");
    if (await fileExists(pyprojectPath)) {
      try {
        const content = await readFile(pyprojectPath, "utf-8");
        if (content.includes("sphinx") || content.includes("mkdocs") || content.includes("pdoc")) {
          evidence.push("pyproject.toml:docs tool");
        }
      } catch {
        // Ignore errors
      }
    }
  }

  // Check for Rust documentation
  if (projectType === "rust") {
    // Rust has built-in doc support via cargo doc
    if (await fileExists(join(directory, "Cargo.toml"))) {
      evidence.push("cargo doc (built-in)");
    }
  }

  // Sample source files for inline documentation
  const srcDir = join(directory, "src");
  if (await directoryExists(srcDir)) {
    const sourceFiles = await findFilesWithPattern(srcDir, /\.(ts|js|py|rs|go)$/, 1);
    for (const file of sourceFiles.slice(0, 2)) {
      try {
        const content = await readFile(join(srcDir, file), "utf-8");
        // Check for documentation comments
        if (
          content.includes("/**") || // JSDoc
          content.includes('"""') || // Python docstring
          content.includes("///") || // Rust doc comment
          content.includes("//!") // Rust module doc
        ) {
          evidence.push(`src/${file}:inline docs`);
          break;
        }
      } catch {
        // Ignore errors
      }
    }
  }

  const passed = evidence.length > 0;

  return {
    id: "code-docs",
    name: "Code Documentation",
    category: "documentation",
    points: passed ? 1 : 0,
    maxPoints: 1,
    passed,
    evidence,
    description: "Project has code documentation (JSDoc, docstrings, etc.)",
  };
}

async function checkHasApiDocs(directory: string): Promise<CriterionResult> {
  const evidence: string[] = [];

  // Check for docs directory
  const docsDirs = ["docs", "documentation", "doc", "api-docs"];
  for (const dir of docsDirs) {
    const docsPath = join(directory, dir);
    if (await directoryExists(docsPath)) {
      // Check if it has substantial content
      try {
        const files = await readdir(docsPath);
        const mdFiles = files.filter(f => f.endsWith(".md") || f.endsWith(".rst") || f.endsWith(".html"));
        if (mdFiles.length >= 2) {
          evidence.push(`${dir}/ (${mdFiles.length} files)`);
        } else if (files.length > 0) {
          evidence.push(`${dir}/`);
        }
      } catch {
        evidence.push(dir);
      }
    }
  }

  // Check for OpenAPI/Swagger
  const apiSpecFiles = ["openapi.yaml", "openapi.yml", "openapi.json", "swagger.yaml", "swagger.yml", "swagger.json", "api.yaml", "api.json"];
  for (const file of apiSpecFiles) {
    if (await fileExists(join(directory, file))) {
      evidence.push(file);
    }
  }

  // Check for API documentation in common locations
  const apiDocsFiles = ["API.md", "api.md", "REFERENCE.md", "docs/api.md", "docs/API.md"];
  for (const file of apiDocsFiles) {
    if (await fileExists(join(directory, file))) {
      evidence.push(file);
    }
  }

  // Check for CONTRIBUTING.md and CHANGELOG.md as part of comprehensive docs
  const extraDocs = ["CONTRIBUTING.md", "CHANGELOG.md", "SECURITY.md", "CODE_OF_CONDUCT.md"];
  let extraDocsCount = 0;
  for (const file of extraDocs) {
    if (await fileExists(join(directory, file))) {
      extraDocsCount++;
    }
  }
  if (extraDocsCount >= 2) {
    evidence.push(`${extraDocsCount} additional docs`);
  }

  const passed = evidence.length > 0;

  return {
    id: "api-docs",
    name: "API/Comprehensive Documentation",
    category: "documentation",
    points: passed ? 1 : 0,
    maxPoints: 1,
    passed,
    evidence,
    description: "Project has API documentation or comprehensive docs folder",
  };
}

// ============================================================================
// CI/CD Criteria
// ============================================================================

async function checkHasCIConfig(directory: string): Promise<CriterionResult> {
  const ciConfigs = [
    // GitHub Actions
    ".github/workflows",
    // GitLab CI
    ".gitlab-ci.yml",
    // CircleCI
    ".circleci/config.yml",
    ".circleci",
    // Travis CI
    ".travis.yml",
    // Jenkins
    "Jenkinsfile",
    // Azure Pipelines
    "azure-pipelines.yml",
    // Bitbucket Pipelines
    "bitbucket-pipelines.yml",
    // Drone CI
    ".drone.yml",
    // Buildkite
    ".buildkite",
  ];

  const evidence: string[] = [];

  for (const config of ciConfigs) {
    const configPath = join(directory, config);
    if (await fileExists(configPath) || await directoryExists(configPath)) {
      // For GitHub Actions, count the workflows
      if (config === ".github/workflows") {
        try {
          const files = await readdir(configPath);
          const ymlFiles = files.filter(f => f.endsWith(".yml") || f.endsWith(".yaml"));
          if (ymlFiles.length > 0) {
            evidence.push(`GitHub Actions (${ymlFiles.length} workflows)`);
          }
        } catch {
          evidence.push("GitHub Actions");
        }
      } else {
        evidence.push(config);
      }
    }
  }

  const passed = evidence.length > 0;

  return {
    id: "ci-config",
    name: "CI Configuration",
    category: "cicd",
    points: passed ? 1 : 0,
    maxPoints: 1,
    passed,
    evidence,
    description: "Project has continuous integration configuration",
  };
}

async function checkHasDeploymentConfig(directory: string): Promise<CriterionResult> {
  const deploymentIndicators = [
    // Docker
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    ".dockerignore",
    // Kubernetes
    "kubernetes",
    "k8s",
    "helm",
    "chart",
    // Serverless
    "serverless.yml",
    "serverless.yaml",
    "netlify.toml",
    "vercel.json",
    // Terraform/Infrastructure
    "terraform",
    ".terraform",
    "main.tf",
    "pulumi",
    "Pulumi.yaml",
    // Cloud-specific
    "app.yaml", // Google App Engine
    "appspec.yml", // AWS CodeDeploy
    "fly.toml", // Fly.io
    "render.yaml", // Render
    "railway.json", // Railway
    // Release automation
    ".releaserc",
    ".releaserc.json",
    ".releaserc.js",
    "release.config.js",
  ];

  const evidence: string[] = [];

  for (const indicator of deploymentIndicators) {
    const path = join(directory, indicator);
    if (await fileExists(path) || await directoryExists(path)) {
      evidence.push(indicator);
    }
  }

  // Check package.json for deployment scripts
  const packageJsonPath = join(directory, "package.json");
  if (await fileExists(packageJsonPath)) {
    try {
      const content = await readFile(packageJsonPath, "utf-8");
      const pkg = JSON.parse(content);
      const deployScripts = ["deploy", "release", "publish"];
      for (const script of deployScripts) {
        if (pkg.scripts?.[script]) {
          evidence.push(`package.json:${script}`);
        }
      }
    } catch {
      // Ignore errors
    }
  }

  // Check for CD in GitHub Actions
  const workflowsDir = join(directory, ".github", "workflows");
  if (await directoryExists(workflowsDir)) {
    try {
      const files = await readdir(workflowsDir);
      for (const file of files) {
        if (file.includes("deploy") || file.includes("release") || file.includes("cd") || file.includes("publish")) {
          evidence.push(`.github/workflows/${file}`);
        }
      }
    } catch {
      // Ignore errors
    }
  }

  const passed = evidence.length > 0;

  return {
    id: "deployment",
    name: "Deployment/Release Configuration",
    category: "cicd",
    points: passed ? 1 : 0,
    maxPoints: 1,
    passed,
    evidence,
    description: "Project has deployment or release automation configured",
  };
}

// ============================================================================
// Type Safety Criteria
// ============================================================================

async function checkHasTypeConfig(directory: string, projectType: ProjectType): Promise<CriterionResult> {
  const evidence: string[] = [];

  // TypeScript
  if (projectType === "typescript" || projectType === "node") {
    const tsConfigs = ["tsconfig.json", "jsconfig.json"];
    for (const config of tsConfigs) {
      if (await fileExists(join(directory, config))) {
        evidence.push(config);
      }
    }
  }

  // Python type checking
  if (projectType === "python") {
    const pythonTypeConfigs = ["mypy.ini", ".mypy.ini", "pyrightconfig.json", "pyright.json"];
    for (const config of pythonTypeConfigs) {
      if (await fileExists(join(directory, config))) {
        evidence.push(config);
      }
    }

    // Check pyproject.toml for type checking
    const pyprojectPath = join(directory, "pyproject.toml");
    if (await fileExists(pyprojectPath)) {
      try {
        const content = await readFile(pyprojectPath, "utf-8");
        if (content.includes("[tool.mypy") || content.includes("[tool.pyright")) {
          evidence.push("pyproject.toml:type checker");
        }
      } catch {
        // Ignore errors
      }
    }

    // Check for py.typed marker
    const srcDir = join(directory, "src");
    if (await directoryExists(srcDir)) {
      const entries = await readdir(srcDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (await fileExists(join(srcDir, entry.name, "py.typed"))) {
            evidence.push(`src/${entry.name}/py.typed`);
            break;
          }
        }
      }
    }
  }

  // Go - statically typed by default
  if (projectType === "go") {
    if (await fileExists(join(directory, "go.mod"))) {
      evidence.push("Go (statically typed)");
    }
  }

  // Rust - statically typed by default
  if (projectType === "rust") {
    if (await fileExists(join(directory, "Cargo.toml"))) {
      evidence.push("Rust (statically typed)");
    }
  }

  // Check package.json for TypeScript
  const packageJsonPath = join(directory, "package.json");
  if (await fileExists(packageJsonPath)) {
    try {
      const content = await readFile(packageJsonPath, "utf-8");
      const pkg = JSON.parse(content);
      if (pkg.devDependencies?.typescript || pkg.dependencies?.typescript) {
        evidence.push("TypeScript installed");
      }
    } catch {
      // Ignore errors
    }
  }

  const passed = evidence.length > 0;

  return {
    id: "type-config",
    name: "Type System Configured",
    category: "typesafety",
    points: passed ? 1 : 0,
    maxPoints: 1,
    passed,
    evidence,
    description: "Project has type checking configured",
  };
}

async function checkHasStrictTypes(directory: string, projectType: ProjectType): Promise<CriterionResult> {
  const evidence: string[] = [];

  // Check TypeScript strict mode
  const tsconfigPath = join(directory, "tsconfig.json");
  if (await fileExists(tsconfigPath)) {
    try {
      const content = await readFile(tsconfigPath, "utf-8");
      // Simple check - look for strict settings
      const hasStrict = content.includes('"strict": true') || content.includes('"strict":true');
      const hasStrictNullChecks = content.includes('"strictNullChecks": true') || content.includes('"strictNullChecks":true');
      const hasNoImplicitAny = content.includes('"noImplicitAny": true') || content.includes('"noImplicitAny":true');

      if (hasStrict) {
        evidence.push("tsconfig.json:strict");
      } else if (hasStrictNullChecks && hasNoImplicitAny) {
        evidence.push("tsconfig.json:partial strict");
      }
    } catch {
      // Ignore errors
    }
  }

  // Check Python strict type checking
  if (projectType === "python") {
    // Check mypy strict mode
    const mypyConfigs = ["mypy.ini", ".mypy.ini"];
    for (const config of mypyConfigs) {
      const configPath = join(directory, config);
      if (await fileExists(configPath)) {
        try {
          const content = await readFile(configPath, "utf-8");
          if (content.includes("strict = True") || content.includes("strict=True") || content.includes("strict = true")) {
            evidence.push(`${config}:strict`);
          }
        } catch {
          // Ignore errors
        }
      }
    }

    // Check pyproject.toml for strict mypy
    const pyprojectPath = join(directory, "pyproject.toml");
    if (await fileExists(pyprojectPath)) {
      try {
        const content = await readFile(pyprojectPath, "utf-8");
        if (content.includes("strict = true")) {
          evidence.push("pyproject.toml:mypy strict");
        }
      } catch {
        // Ignore errors
      }
    }
  }

  // Go and Rust are inherently strict
  if (projectType === "go") {
    if (await fileExists(join(directory, "go.mod"))) {
      evidence.push("Go (inherently strict)");
    }
  }

  if (projectType === "rust") {
    // Check for deny warnings in Cargo.toml or lib.rs
    const cargoPath = join(directory, "Cargo.toml");
    if (await fileExists(cargoPath)) {
      try {
        const content = await readFile(cargoPath, "utf-8");
        if (content.includes("#![deny(warnings)]") || content.includes("warnings = \"deny\"")) {
          evidence.push("Cargo.toml:deny warnings");
        } else {
          evidence.push("Rust (inherently strict)");
        }
      } catch {
        evidence.push("Rust (inherently strict)");
      }
    }
  }

  const passed = evidence.length > 0;

  return {
    id: "strict-types",
    name: "Strict Type Checking",
    category: "typesafety",
    points: passed ? 1 : 0,
    maxPoints: 1,
    passed,
    evidence,
    description: "Project has strict type checking enabled",
  };
}

// ============================================================================
// Score Calculation
// ============================================================================

function calculateCategoryResults(criteria: CriterionResult[]): CategoryResult[] {
  const categories: CategoryResult[] = [];

  for (const [category, config] of Object.entries(CATEGORY_CONFIG)) {
    const categoryCriteria = criteria.filter(c => c.category === category);
    const points = categoryCriteria.reduce((sum, c) => sum + c.points, 0);
    const recommendations: string[] = [];

    // Generate category-specific recommendations
    for (const criterion of categoryCriteria) {
      if (!criterion.passed) {
        recommendations.push(getRecommendationForCriterion(criterion));
      }
    }

    categories.push({
      category: category as MaturityCategory,
      displayName: config.displayName,
      points,
      maxPoints: config.maxPoints,
      criteria: categoryCriteria,
      recommendations,
    });
  }

  return categories;
}

function determineLevel(score: number): MaturityLevel {
  for (const threshold of LEVEL_THRESHOLDS) {
    if (score >= threshold.min) {
      return threshold.level;
    }
  }
  return "nascent";
}

function getLevelDescription(level: MaturityLevel): string {
  const threshold = LEVEL_THRESHOLDS.find(t => t.level === level);
  return threshold?.description ?? "Unknown level";
}

// ============================================================================
// Recommendations Generation
// ============================================================================

function getRecommendationForCriterion(criterion: CriterionResult): string {
  const recommendations: Record<string, string> = {
    "test-files": "Add test files to cover your codebase functionality",
    "test-config": "Configure a test framework (Jest, Vitest, pytest, etc.)",
    "test-coverage": "Set up test coverage reporting to track testing completeness",
    "linter": "Add a linter (ESLint, Ruff, golangci-lint) to enforce code quality",
    "formatter": "Configure a code formatter (Prettier, Black) for consistent style",
    "pre-commit": "Set up pre-commit hooks (Husky, pre-commit) to catch issues early",
    "readme": "Create a comprehensive README.md documenting your project",
    "code-docs": "Add inline documentation (JSDoc, docstrings) to your code",
    "api-docs": "Create API documentation or a docs/ folder with guides",
    "ci-config": "Set up CI (GitHub Actions, GitLab CI) for automated testing",
    "deployment": "Configure automated deployment or release process",
    "type-config": "Add type checking (TypeScript, mypy) for safer code",
    "strict-types": "Enable strict type checking for maximum type safety",
  };

  return recommendations[criterion.id] ?? `Improve ${criterion.name}`;
}

function generateRecommendations(_categories: CategoryResult[], criteria: CriterionResult[]): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Sort criteria by impact (category max points) and ease of implementation
  const failedCriteria = criteria.filter(c => !c.passed);

  const priorityMap: Record<string, { difficulty: "easy" | "medium" | "hard"; priority: number }> = {
    "readme": { difficulty: "easy", priority: 1 },
    "linter": { difficulty: "easy", priority: 2 },
    "formatter": { difficulty: "easy", priority: 3 },
    "test-files": { difficulty: "medium", priority: 4 },
    "test-config": { difficulty: "easy", priority: 5 },
    "ci-config": { difficulty: "medium", priority: 6 },
    "type-config": { difficulty: "medium", priority: 7 },
    "pre-commit": { difficulty: "easy", priority: 8 },
    "code-docs": { difficulty: "medium", priority: 9 },
    "test-coverage": { difficulty: "medium", priority: 10 },
    "api-docs": { difficulty: "hard", priority: 11 },
    "strict-types": { difficulty: "medium", priority: 12 },
    "deployment": { difficulty: "hard", priority: 13 },
  };

  for (const criterion of failedCriteria) {
    const config = priorityMap[criterion.id] ?? { difficulty: "medium" as const, priority: 99 };

    recommendations.push({
      priority: config.priority,
      category: criterion.category,
      title: criterion.name,
      description: getRecommendationForCriterion(criterion),
      potentialPoints: criterion.maxPoints,
      difficulty: config.difficulty,
    });
  }

  // Sort by priority
  recommendations.sort((a, b) => a.priority - b.priority);

  return recommendations;
}

// ============================================================================
// Display Functions
// ============================================================================

function displayResults(result: MaturityResult): void {
  // Display score header
  const levelEmoji = getLevelEmoji(result.level);
  const levelColor = getLevelColor(result.level);

  printDivider();
  console.log(`\n${levelEmoji} ${COLORS.bold}Maturity Score: ${result.score}/${result.maxScore}${COLORS.reset}`);
  console.log(`   ${levelColor}${result.level.toUpperCase()}${COLORS.reset} - ${getLevelDescription(result.level)}`);
  console.log(`   Project Type: ${result.projectType}\n`);

  // Display progress bar
  const progressBar = generateProgressBar(result.score, result.maxScore);
  console.log(`   ${progressBar}\n`);

  // Display category breakdown
  printDivider();
  console.log(`\n${COLORS.bold}Category Breakdown${COLORS.reset}\n`);

  for (const category of result.categories) {
    const categoryIcon = category.points === category.maxPoints ? ICONS.success : category.points > 0 ? ICONS.warning : ICONS.error;
    const categoryColor = category.points === category.maxPoints ? COLORS.green : category.points > 0 ? COLORS.yellow : COLORS.red;

    console.log(`${categoryColor}${categoryIcon}${COLORS.reset} ${COLORS.bold}${category.displayName}${COLORS.reset}: ${category.points}/${category.maxPoints}`);

    for (const criterion of category.criteria) {
      const icon = criterion.passed ? `${COLORS.green}${ICONS.success}${COLORS.reset}` : `${COLORS.red}${ICONS.error}${COLORS.reset}`;
      const evidenceStr = criterion.evidence.length > 0 ? ` ${COLORS.dim}(${criterion.evidence.slice(0, 2).join(", ")}${criterion.evidence.length > 2 ? "..." : ""})${COLORS.reset}` : "";
      console.log(`    ${icon} ${criterion.name}${evidenceStr}`);
    }
    console.log();
  }

  // Display recommendations
  if (result.recommendations.length > 0) {
    printDivider();
    console.log(`\n${COLORS.bold}Recommendations (by priority)${COLORS.reset}\n`);

    const topRecommendations = result.recommendations.slice(0, 5);
    for (let i = 0; i < topRecommendations.length; i++) {
      const rec = topRecommendations[i]!;
      const difficultyColor = rec.difficulty === "easy" ? COLORS.green : rec.difficulty === "medium" ? COLORS.yellow : COLORS.red;
      const difficultyLabel = rec.difficulty === "easy" ? "Easy" : rec.difficulty === "medium" ? "Medium" : "Hard";

      console.log(`  ${i + 1}. ${COLORS.bold}${rec.title}${COLORS.reset} ${difficultyColor}[${difficultyLabel}]${COLORS.reset} +${rec.potentialPoints}pt`);
      console.log(`     ${COLORS.dim}${rec.description}${COLORS.reset}`);
    }

    if (result.recommendations.length > 5) {
      console.log(`\n  ${COLORS.dim}... and ${result.recommendations.length - 5} more recommendations${COLORS.reset}`);
    }
  } else {
    printDivider();
    console.log(`\n${COLORS.green}${ICONS.success} All criteria met! Your project follows best practices.${COLORS.reset}`);
  }

  console.log();
}

function getLevelEmoji(level: MaturityLevel): string {
  const emojis: Record<MaturityLevel, string> = {
    nascent: "🌱",
    developing: "🌿",
    established: "🌳",
    mature: "🏆",
    exemplary: "⭐",
  };
  return emojis[level];
}

function getLevelColor(level: MaturityLevel): string {
  const colors: Record<MaturityLevel, string> = {
    nascent: COLORS.red,
    developing: COLORS.yellow,
    established: COLORS.cyan,
    mature: COLORS.green,
    exemplary: COLORS.magenta,
  };
  return colors[level];
}

function generateProgressBar(score: number, maxScore: number): string {
  const width = 30;
  const filled = Math.round((score / maxScore) * width);
  const empty = width - filled;

  const filledBar = "█".repeat(filled);
  const emptyBar = "░".repeat(empty);

  const percentage = Math.round((score / maxScore) * 100);

  return `[${COLORS.green}${filledBar}${COLORS.reset}${emptyBar}] ${percentage}%`;
}

// ============================================================================
// Utility Functions
// ============================================================================

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function findFilesWithPattern(directory: string, pattern: RegExp, maxDepth: number = 3): Promise<string[]> {
  const files: string[] = [];

  async function scan(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

        if (entry.isFile() && pattern.test(entry.name)) {
          files.push(entry.name);
          if (files.length >= 10) return; // Limit results
        } else if (entry.isDirectory() && depth < maxDepth) {
          await scan(join(dir, entry.name), depth + 1);
        }
      }
    } catch {
      // Ignore errors (permission issues, etc.)
    }
  }

  await scan(directory, 1);
  return files;
}
