/**
 * WorkflowEngine - Phase tracking and workflow orchestration
 *
 * Implements the 5-phase workflow progression:
 * Intent → Assessment → Exploration → Implementation → Verification
 *
 * Key features:
 * - Phase detection from tool usage patterns
 * - Heuristic-based intent classification
 * - Phase transition logic with history tracking
 * - Phase-specific guidance generation
 *
 * @module WorkflowEngine
 */

import type {
  WorkflowPhase,
  WorkflowState,
  PhaseTransition,
  IntentType,
} from "../types.js";
import { createLogger } from "../../lib/logger.js";
import * as SessionManager from "./session-manager.js";

const logger = createLogger("atreides:workflow-engine");

// =============================================================================
// Tool Pattern Mapping
// =============================================================================

/**
 * Tool patterns that indicate specific workflow phases.
 * Used for heuristic-based phase detection.
 */
export const PHASE_TOOL_PATTERNS: Record<string, WorkflowPhase[]> = {
  // Exploration tools - reading, searching, understanding
  read: ["exploration"],
  grep: ["exploration"],
  grep_search: ["exploration"],
  file_search: ["exploration"],
  list_dir: ["exploration"],
  glob: ["exploration"],
  search: ["exploration"],
  codebase_search: ["exploration"],

  // Implementation tools - writing, editing, executing
  edit: ["implementation"],
  write: ["implementation"],
  multiedit: ["implementation"],
  create: ["implementation"],

  // Bash can be exploration, implementation, or verification
  bash: ["exploration", "implementation", "verification"],
  shell: ["exploration", "implementation", "verification"],

  // Verification tools - testing, validating
  test: ["verification"],
  lint: ["verification"],
  typecheck: ["verification"],
  build: ["verification"],

  // Todo tools - can be any phase
  todowrite: ["intent", "assessment", "exploration", "implementation"],
};

/**
 * Test command patterns for bash/shell tools.
 * When detected, indicates verification phase.
 */
const TEST_COMMAND_PATTERNS = [
  /\btest\b/i,
  /\bjest\b/i,
  /\bvitest\b/i,
  /\bmocha\b/i,
  /\bpytest\b/i,
  /\bcargo test\b/i,
  /\bgo test\b/i,
  /\bnpm test\b/i,
  /\bbun test\b/i,
  /\byarn test\b/i,
  /\bmake test\b/i,
];

/**
 * Build/lint command patterns for bash/shell tools.
 * When detected, indicates verification phase.
 */
const BUILD_COMMAND_PATTERNS = [
  /\bbuild\b/i,
  /\blint\b/i,
  /\btsc\b/,
  /\btypecheck\b/i,
  /\bcompile\b/i,
  /\bnpm run build\b/i,
  /\bbun build\b/i,
  /\bcargo build\b/i,
];

/**
 * Implementation command patterns for bash/shell tools.
 * When detected, indicates implementation phase.
 *
 * Includes:
 * - Package management (npm install, pip install, cargo add, go get)
 * - Git operations that modify state (add, commit, merge, rebase, cherry-pick)
 * - File system modifications (mkdir, touch, cp, mv, rm)
 * - Build/setup execution commands
 */
const IMPLEMENTATION_COMMAND_PATTERNS = [
  // Package management - installing dependencies
  /\b(npm|yarn|pnpm|bun)\s+install\b/i,
  /\b(pip|pipenv|poetry)\s+install\b/i,
  /\bcargo\s+add\b/i,
  /\bgo\s+get\b/i,
  /\bgo\s+mod\s+tidy\b/i,
  /\bbrew\s+install\b/i,
  /\bapt(-get)?\s+install\b/i,

  // Git operations (non-read-only, state-modifying)
  /\bgit\s+add\b/i,
  /\bgit\s+commit\b/i,
  /\bgit\s+merge\b/i,
  /\bgit\s+rebase\b/i,
  /\bgit\s+cherry-pick\b/i,
  /\bgit\s+stash\b/i,
  /\bgit\s+checkout\s+-b\b/i, // Creating new branch
  /\bgit\s+push\b/i,
  /\bgit\s+pull\b/i,
  /\bgit\s+reset\b/i,

  // File system modifications
  /\bmkdir\b/,
  /\btouch\b/,
  /\bcp\s+-/,  // cp with flags
  /\bcp\s+\S+\s+\S+/,  // cp source dest
  /\bmv\s+/,
  /\brm\s+-/,  // rm with flags (careful deletion)
  /\bchmod\b/,
  /\bchown\b/,

  // Build/setup commands that modify state
  /\bnpm\s+run\b/i,
  /\byarn\s+run\b/i,
  /\bmake\s+/,  // make with target
  /\bcmake\b/i,
  /\bdocker\s+build\b/i,
  /\bdocker\s+run\b/i,
];

/**
 * Exploration command patterns for bash/shell tools.
 * When detected, indicates exploration phase.
 *
 * Includes:
 * - Read-only git operations (status, log, diff, show, branch)
 * - File inspection (cat, ls, find, grep, head, tail, less, more)
 * - System inspection (which, whereis, env, pwd)
 */
const EXPLORATION_COMMAND_PATTERNS = [
  // Read-only git operations
  /\bgit\s+status\b/i,
  /\bgit\s+log\b/i,
  /\bgit\s+diff\b/i,
  /\bgit\s+show\b/i,
  /\bgit\s+branch\b/i,
  /\bgit\s+remote\b/i,
  /\bgit\s+describe\b/i,
  /\bgit\s+blame\b/i,
  /\bgit\s+shortlog\b/i,

  // File inspection (read-only)
  /\bcat\s+/,
  /\bls\b/,
  /\bfind\s+/,
  /\bgrep\s+/,
  /\brg\s+/,  // ripgrep
  /\bhead\s+/,
  /\btail\s+/,
  /\bless\b/,
  /\bmore\b/,
  /\bwc\s+/,
  /\bfile\s+/,
  /\bstat\s+/,
  /\btree\b/,

  // System inspection
  /\bwhich\s+/,
  /\bwhereis\s+/,
  /\benv\b/,
  /\bpwd\b/,
  /\becho\s+\$/,  // echo $VAR (environment inspection)
  /\bprintenv\b/,
  /\btype\s+/,
  /\bcommand\s+-v\b/,
];

// =============================================================================
// Intent Classification Patterns
// =============================================================================

/**
 * Keywords for heuristic intent classification.
 */
const INTENT_KEYWORDS: Record<IntentType, string[]> = {
  feature: [
    "add",
    "implement",
    "create",
    "build",
    "new feature",
    "feature",
    "develop",
  ],
  bugfix: [
    "fix",
    "bug",
    "error",
    "issue",
    "broken",
    "not working",
    "crash",
    "failing",
  ],
  refactor: [
    "refactor",
    "clean up",
    "improve",
    "optimize",
    "restructure",
    "reorganize",
  ],
  exploration: [
    "understand",
    "explain",
    "how does",
    "what is",
    "find",
    "search",
    "where",
    "show me",
  ],
  documentation: [
    "document",
    "docs",
    "readme",
    "comment",
    "jsdoc",
    "tsdoc",
    "explain",
  ],
  test: ["test", "coverage", "spec", "unit test", "integration test", "e2e"],
  config: [
    "config",
    "configure",
    "setup",
    "settings",
    "environment",
    "env",
    ".json",
    ".yaml",
  ],
  unknown: [],
};

// =============================================================================
// Phase Transition Rules
// =============================================================================

/**
 * Valid phase transitions.
 * Maps current phase to allowed next phases.
 */
const VALID_TRANSITIONS: Record<WorkflowPhase, WorkflowPhase[]> = {
  idle: ["intent"],
  intent: ["assessment", "exploration"], // Can skip assessment if exploring immediately
  assessment: ["exploration", "implementation"], // Can skip exploration if clear what to do
  exploration: ["implementation", "assessment"], // May need to re-assess after exploration
  implementation: ["verification", "exploration"], // May need to explore more during implementation
  verification: ["intent", "implementation", "idle"], // Can cycle back or complete
};

// =============================================================================
// WorkflowEngine Class
// =============================================================================

/**
 * WorkflowEngine manages workflow phase tracking and transitions.
 *
 * @example
 * ```typescript
 * const engine = new WorkflowEngine();
 *
 * // Update phase based on tool usage
 * await engine.updatePhase("read", "session-1");
 *
 * // Get current phase
 * const phase = engine.getCurrentPhase("session-1");
 *
 * // Classify user intent
 * const intent = engine.classifyIntent("Fix the authentication bug");
 * ```
 */
export class WorkflowEngine {
  /**
   * Performance target: <5ms per phase update
   */
  private static readonly PERFORMANCE_TARGET_MS = 5;

  /**
   * Update the workflow phase based on tool usage.
   * This is the primary method called from the tool.execute.after hook.
   *
   * @param tool - The tool that was executed
   * @param sessionId - Session identifier
   * @param input - Optional tool input for context (e.g., bash command)
   * @returns The new phase if transition occurred, or current phase
   */
  async updatePhase(
    tool: string,
    sessionId: string,
    input?: unknown
  ): Promise<WorkflowPhase> {
    const startTime = Date.now();

    try {
      const state = SessionManager.getStateOrUndefined(sessionId);
      if (!state) {
        logger.debug("No session state found", { sessionId });
        return "idle";
      }

      const currentPhase = state.workflow.currentPhase;

      // Detect what phase this tool suggests
      const detectedPhase = this.detectPhaseFromTool(tool, currentPhase, input);

      // Check if we should transition
      if (detectedPhase && detectedPhase !== currentPhase) {
        if (this.isValidTransition(currentPhase, detectedPhase)) {
          this.transitionPhase(sessionId, currentPhase, detectedPhase, tool);
          return detectedPhase;
        } else {
          logger.debug("Invalid transition blocked", {
            from: currentPhase,
            to: detectedPhase,
            tool,
          });
        }
      }

      return currentPhase;
    } catch (error) {
      // Graceful degradation: log error but never throw
      logger.error("Phase update failed", {
        error: error instanceof Error ? error.message : String(error),
        tool,
        sessionId,
      });
      return "idle";
    } finally {
      const duration = Date.now() - startTime;
      if (duration > WorkflowEngine.PERFORMANCE_TARGET_MS) {
        logger.warn("Phase update exceeded performance target", {
          duration,
          target: WorkflowEngine.PERFORMANCE_TARGET_MS,
        });
      }
    }
  }

  /**
   * Detect which phase a tool execution suggests.
   *
   * @param tool - Tool name (normalized to lowercase)
   * @param currentPhase - Current workflow phase
   * @param input - Optional tool input for context
   * @returns Suggested phase or undefined if no suggestion
   */
  detectPhaseFromTool(
    tool: string,
    currentPhase: WorkflowPhase,
    input?: unknown
  ): WorkflowPhase | undefined {
    const normalizedTool = tool.toLowerCase();

    // Handle bash/shell specially - analyze the command
    if (normalizedTool === "bash" || normalizedTool === "shell") {
      return this.detectPhaseFromBashCommand(currentPhase, input);
    }

    // Look up tool in patterns
    const possiblePhases = PHASE_TOOL_PATTERNS[normalizedTool];
    if (!possiblePhases || possiblePhases.length === 0) {
      return undefined;
    }

    // If only one possible phase, return it
    if (possiblePhases.length === 1) {
      return possiblePhases[0];
    }

    // Multiple possible phases - use context to decide
    // Prefer forward progression in the workflow
    const phaseOrder: WorkflowPhase[] = [
      "idle",
      "intent",
      "assessment",
      "exploration",
      "implementation",
      "verification",
    ];
    const currentIndex = phaseOrder.indexOf(currentPhase);

    // Find the first possible phase that's after current phase
    for (const phase of possiblePhases) {
      const phaseIndex = phaseOrder.indexOf(phase);
      if (phaseIndex > currentIndex) {
        return phase;
      }
    }

    // If no forward phase found, return first possible phase
    return possiblePhases[0];
  }

  /**
   * Detect phase from bash/shell command content.
   *
   * Pattern matching priority (most specific first):
   * 1. Implementation patterns → "implementation" (package installs, git commits, file modifications)
   * 2. Test/build patterns → "verification" (test runners, compilers, linters)
   * 3. Exploration patterns → "exploration" (git status, cat, ls, find, grep)
   * 4. Default heuristic based on current phase
   *
   * @example
   * ```typescript
   * detectPhaseFromBashCommand("idle", { command: "npm install" }); // → "implementation"
   * detectPhaseFromBashCommand("idle", { command: "npm test" }); // → "verification"
   * detectPhaseFromBashCommand("idle", { command: "git status" }); // → "exploration"
   * detectPhaseFromBashCommand("implementation", { command: "ls" }); // → "exploration"
   * ```
   *
   * @param currentPhase - Current workflow phase
   * @param input - Tool input containing the command
   * @returns Detected phase
   */
  private detectPhaseFromBashCommand(
    currentPhase: WorkflowPhase,
    input?: unknown
  ): WorkflowPhase {
    const command = this.extractCommand(input);
    if (!command) {
      // No command to analyze, stay in current phase or default to exploration
      return currentPhase === "idle" ? "exploration" : currentPhase;
    }

    // Priority 1: Check for implementation commands (most specific - state-modifying operations)
    // These include package installs, git commits, file modifications
    if (IMPLEMENTATION_COMMAND_PATTERNS.some((p) => p.test(command))) {
      logger.debug("Bash command matched implementation pattern", { command });
      return "implementation";
    }

    // Priority 2: Check for test commands (verification)
    if (TEST_COMMAND_PATTERNS.some((p) => p.test(command))) {
      logger.debug("Bash command matched test pattern", { command });
      return "verification";
    }

    // Priority 3: Check for build/lint commands (verification)
    if (BUILD_COMMAND_PATTERNS.some((p) => p.test(command))) {
      logger.debug("Bash command matched build pattern", { command });
      return "verification";
    }

    // Priority 4: Check for exploration commands (read-only operations)
    // These include git status, file inspection, system inspection
    if (EXPLORATION_COMMAND_PATTERNS.some((p) => p.test(command))) {
      logger.debug("Bash command matched exploration pattern", { command });
      return "exploration";
    }

    // Default heuristic: exploration if early in workflow, otherwise stay in current phase
    if (
      currentPhase === "idle" ||
      currentPhase === "intent" ||
      currentPhase === "assessment"
    ) {
      return "exploration";
    }

    return currentPhase;
  }

  /**
   * Extract command string from tool input.
   *
   * @param input - Tool input (various formats)
   * @returns Command string or undefined
   */
  private extractCommand(input: unknown): string | undefined {
    if (typeof input === "string") {
      return input;
    }
    if (input && typeof input === "object") {
      const obj = input as Record<string, unknown>;
      if (typeof obj.command === "string") {
        return obj.command;
      }
      if (typeof obj.cmd === "string") {
        return obj.cmd;
      }
    }
    return undefined;
  }

  /**
   * Check if a phase transition is valid.
   *
   * @param from - Current phase
   * @param to - Target phase
   * @returns True if transition is allowed
   */
  isValidTransition(from: WorkflowPhase, to: WorkflowPhase): boolean {
    const validTargets = VALID_TRANSITIONS[from];
    return validTargets.includes(to);
  }

  /**
   * Perform a phase transition and record it in history.
   *
   * @param sessionId - Session identifier
   * @param from - Current phase
   * @param to - Target phase
   * @param triggeredBy - Tool that triggered the transition
   * @param reason - Optional reason for transition
   */
  transitionPhase(
    sessionId: string,
    from: WorkflowPhase,
    to: WorkflowPhase,
    triggeredBy?: string,
    reason?: string
  ): void {
    const state = SessionManager.getStateOrUndefined(sessionId);
    if (!state) {
      logger.warn("Cannot transition: session not found", { sessionId });
      return;
    }

    // Record the transition
    const transition: PhaseTransition = {
      from,
      to,
      timestamp: Date.now(),
    };
    if (triggeredBy !== undefined) {
      transition.triggeredBy = triggeredBy;
    }
    if (reason !== undefined) {
      transition.reason = reason;
    }

    state.workflow.phaseHistory.push(transition);
    state.workflow.currentPhase = to;
    state.phase = to; // Keep shortcut in sync

    // Mark workflow complete if reaching verification
    if (to === "verification" && !state.workflow.completed) {
      // Will be marked complete on successful verification
    }

    // Mark workflow complete if returning to idle from verification
    if (to === "idle" && from === "verification") {
      state.workflow.completed = true;
    }

    logger.info("Phase transition", {
      sessionId,
      from,
      to,
      triggeredBy,
    });
  }

  /**
   * Get the current workflow phase for a session.
   *
   * @param sessionId - Session identifier
   * @returns Current phase or "idle" if session not found
   */
  getCurrentPhase(sessionId: string): WorkflowPhase {
    const state = SessionManager.getStateOrUndefined(sessionId);
    return state?.workflow.currentPhase ?? "idle";
  }

  /**
   * Get the full workflow state for a session.
   *
   * @param sessionId - Session identifier
   * @returns WorkflowState or undefined if session not found
   */
  getWorkflowState(sessionId: string): WorkflowState | undefined {
    return SessionManager.getWorkflowState(sessionId);
  }

  /**
   * Classify user intent from message text using heuristics.
   *
   * @param message - User's message text
   * @returns Classified intent type
   */
  classifyIntent(message: string): IntentType {
    const lowerMessage = message.toLowerCase();

    // Score each intent type based on keyword matches
    const scores: Record<IntentType, number> = {
      feature: 0,
      bugfix: 0,
      refactor: 0,
      exploration: 0,
      documentation: 0,
      test: 0,
      config: 0,
      unknown: 0,
    };

    for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowerMessage.includes(keyword.toLowerCase())) {
          scores[intent as IntentType]++;
        }
      }
    }

    // Find the intent with highest score
    let maxScore = 0;
    let maxIntent: IntentType = "unknown";

    for (const [intent, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        maxIntent = intent as IntentType;
      }
    }

    return maxIntent;
  }

  /**
   * Set the intent classification for a session.
   *
   * @param sessionId - Session identifier
   * @param intent - Classified intent type
   */
  setIntentClassification(sessionId: string, intent: IntentType): void {
    const state = SessionManager.getStateOrUndefined(sessionId);
    if (state) {
      state.workflow.intentClassification = intent;
      logger.debug("Intent classified", { sessionId, intent });
    }
  }

  /**
   * Start the workflow by transitioning from idle to intent.
   * Called when the user sends their first message.
   *
   * @param sessionId - Session identifier
   * @param message - Optional user message for intent classification
   */
  startWorkflow(sessionId: string, message?: string): void {
    const state = SessionManager.getStateOrUndefined(sessionId);
    if (!state) return;

    if (state.workflow.currentPhase === "idle") {
      this.transitionPhase(sessionId, "idle", "intent", undefined, "Workflow started");

      // Classify intent if message provided
      if (message) {
        const intent = this.classifyIntent(message);
        this.setIntentClassification(sessionId, intent);
      }
    }
  }

  /**
   * Generate phase-specific guidance for the AI.
   *
   * @param phase - Current workflow phase
   * @param intent - Optional intent classification
   * @returns Guidance text to include in system prompt
   */
  generatePhaseGuidance(phase: WorkflowPhase, intent?: IntentType): string {
    const guidance: Record<WorkflowPhase, string> = {
      idle: "",
      intent: `[WORKFLOW PHASE: INTENT]
You are in the INTENT phase. Focus on:
- Understanding the user's request
- Asking clarifying questions if needed
- Identifying the scope of the task`,
      assessment: `[WORKFLOW PHASE: ASSESSMENT]
You are in the ASSESSMENT phase. Focus on:
- Analyzing the problem/request
- Identifying what information is needed
- Planning your approach before exploring`,
      exploration: `[WORKFLOW PHASE: EXPLORATION]
You are in the EXPLORATION phase. Focus on:
- Reading relevant files and code
- Searching for patterns and dependencies
- Building understanding before making changes
Do NOT make changes yet - gather information first.`,
      implementation: `[WORKFLOW PHASE: IMPLEMENTATION]
You are in the IMPLEMENTATION phase. Focus on:
- Making targeted, minimal changes
- Following existing patterns and conventions
- Testing changes as you go`,
      verification: `[WORKFLOW PHASE: VERIFICATION]
You are in the VERIFICATION phase. Focus on:
- Running tests to verify changes
- Checking for regressions
- Validating the implementation meets requirements`,
    };

    let text = guidance[phase];

    // Add intent-specific guidance
    if (intent && intent !== "unknown" && phase !== "idle") {
      const intentGuidance: Record<IntentType, string> = {
        feature: "This is a FEATURE implementation task.",
        bugfix: "This is a BUGFIX task. Focus on identifying root cause.",
        refactor: "This is a REFACTOR task. Preserve behavior while improving code.",
        exploration: "This is an EXPLORATION task. Focus on understanding, not changing.",
        documentation: "This is a DOCUMENTATION task. Focus on clarity and completeness.",
        test: "This is a TEST task. Focus on coverage and edge cases.",
        config: "This is a CONFIGURATION task. Be careful with environment-specific values.",
        unknown: "",
      };

      if (intentGuidance[intent]) {
        text += `\n${intentGuidance[intent]}`;
      }
    }

    return text;
  }

  /**
   * Get phase history for a session.
   *
   * @param sessionId - Session identifier
   * @returns Array of phase transitions or empty array
   */
  getPhaseHistory(sessionId: string): PhaseTransition[] {
    const state = SessionManager.getStateOrUndefined(sessionId);
    return state?.workflow.phaseHistory ?? [];
  }

  /**
   * Check if the workflow has been completed (reached verification successfully).
   *
   * @param sessionId - Session identifier
   * @returns True if workflow completed
   */
  isWorkflowComplete(sessionId: string): boolean {
    const state = SessionManager.getStateOrUndefined(sessionId);
    return state?.workflow.completed ?? false;
  }

  /**
   * Reset the workflow state for a session.
   * Used when starting a new task within the same session.
   *
   * @param sessionId - Session identifier
   */
  resetWorkflow(sessionId: string): void {
    const state = SessionManager.getStateOrUndefined(sessionId);
    if (state) {
      state.workflow = SessionManager.createInitialWorkflowState();
      state.phase = "idle";
      logger.info("Workflow reset", { sessionId });
    }
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

/**
 * Default WorkflowEngine instance.
 * Use this for standard plugin integration.
 */
export const workflowEngine = new WorkflowEngine();

// Export class for testing and custom instances
export default WorkflowEngine;
