/**
 * TodoEnforcer - Todo tracking and stop blocking
 *
 * Implements the todo enforcement system that:
 * - Detects todos from AI responses (markdown checkboxes)
 * - Tracks todos in session state
 * - Blocks session stop if pending todos exist
 * - Provides todo status summaries
 *
 * Key features:
 * - Parses markdown checkbox patterns: `- [ ] todo description`
 * - Detects completed checkboxes: `- [x] completed todo`
 * - Tracks todo lifecycle (created, completed)
 * - Generates content-based IDs for duplicate prevention across compactions
 * - Supports nested list detection (indented todos)
 * - Detects completion from subsequent AI responses
 * - Performance target: <5ms per check
 *
 * ## State Shape (`state.todos`)
 *
 * The session state uses a Map<sessionId, Map<todoId, TodoItem>> structure:
 *
 * ```typescript
 * // Per-session todo storage (in TodoEnforcer.sessionTodos)
 * Map<sessionId, Map<todoId, TodoItem>>
 *
 * // TodoItem lifecycle:
 * // 1. Created: id generated from content hash, createdAt set, completedAt undefined
 * // 2. In-progress: same as created (tracked externally via TodoWrite)
 * // 3. Completed: completedAt set to timestamp
 * // 4. Removed: deleted from Map (via removeTodo)
 * ```
 *
 * ## Lifecycle Events
 *
 * 1. **Detection**: `detectTodos()` called from AI response text
 * 2. **Completion via checkbox**: `- [x]` pattern in same response marks as complete
 * 3. **Completion via subsequent response**: `detectCompletionPhrases()` checks for
 *    "completed X", "finished X", "done with X" patterns
 * 4. **Manual completion**: `completeTodo()` or `completeTodoByDescription()`
 * 5. **Removal**: `removeTodo()` for cancelled/irrelevant todos
 * 6. **Session cleanup**: `clearSessionTodos()` on session.deleted event
 */

import * as SessionManager from "./session-manager.js";
import { createLogger } from "../../lib/logger.js";
import { createHash } from "node:crypto";

const logger = createLogger("atreides:todo-enforcer");

/**
 * Represents a single todo item with tracking metadata.
 */
export interface TodoItem {
  /** Unique identifier for this todo */
  id: string;
  /** Human-readable description of the todo */
  description: string;
  /** Timestamp when the todo was created (ms since epoch) */
  createdAt: number;
  /** Timestamp when the todo was completed (ms since epoch), undefined if pending */
  completedAt?: number;
}

/**
 * Result of checking pending todos before session stop.
 */
export interface PendingTodosResult {
  /** Whether the stop action should be allowed */
  allow: boolean;
  /** Message explaining why stop was blocked (if blocked) */
  reason?: string;
  /** Count of pending todos */
  pendingCount: number;
  /** List of pending todo descriptions (for display) */
  pendingTodos: string[];
}

/**
 * Regex patterns for detecting todos in markdown text.
 * Supports nested lists (any level of indentation with spaces or tabs).
 *
 * - Unchecked: `- [ ] description` or `* [ ] description`
 * - Checked: `- [x] description` or `- [X] description` or `* [x] description`
 * - In-progress: `- [-] description` (used by some systems)
 *
 * The patterns capture:
 * - Group 1: Leading whitespace (for nesting level detection)
 * - Group 2: The todo description
 */
const UNCHECKED_TODO_PATTERN = /^([\t ]*[-*+]\s*\[\s*\]\s+)(.+)$/gm;
const CHECKED_TODO_PATTERN = /^([\t ]*[-*+]\s*\[[xX✓✔]\]\s+)(.+)$/gm;
const IN_PROGRESS_TODO_PATTERN = /^([\t ]*[-*+]\s*\[[-~]\]\s+)(.+)$/gm;

/**
 * Patterns for detecting todo completion in subsequent AI responses.
 * These match phrases like "completed X", "finished the Y task", "done with Z".
 */
const COMPLETION_PHRASE_PATTERNS: readonly RegExp[] = [
  /\b(?:completed?|finished?|done|resolved|addressed)\s+(?:the\s+)?["']?([^"'\n.!?]+)["']?\s*(?:task|todo|item)?/gi,
  /\b(?:task|todo|item)\s+["']?([^"'\n.!?]+)["']?\s+(?:is\s+)?(?:completed?|finished?|done)/gi,
  /\b(?:marked?|mark)\s+["']?([^"'\n.!?]+)["']?\s+(?:as\s+)?(?:completed?|finished?|done)/gi,
] as const;

/**
 * TodoEnforcer class for managing todo detection and stop blocking.
 *
 * Each instance maintains its own isolated storage of todos,
 * which is important for testing.
 *
 * @example
 * ```typescript
 * const enforcer = new TodoEnforcer();
 *
 * // Detect todos from AI response
 * enforcer.detectTodos(aiResponse, sessionId);
 *
 * // Check if stop is allowed
 * const result = await enforcer.checkPendingTodos(sessionId);
 * if (!result.allow) {
 *   console.log(result.reason);
 * }
 * ```
 */
export class TodoEnforcer {
  /**
   * Instance-level storage for todos per session.
   * Key: sessionId, Value: Map of todoId -> TodoItem
   */
  private sessionTodos = new Map<string, Map<string, TodoItem>>();
  /**
   * Detect todos from an AI response and track them in session state.
   * Parses markdown checkboxes (including nested lists) and creates TodoItem entries.
   * Also detects completion phrases in subsequent responses.
   *
   * @param aiResponse - The AI response text to scan for todos
   * @param sessionId - The session to associate todos with
   * @returns Number of new todos detected
   */
  detectTodos(aiResponse: string, sessionId: string): number {
    try {
      const todos = this.getOrCreateTodoMap(sessionId);

      // Parse unchecked todos (new tasks) - supports nested lists
      const uncheckedMatches = [...aiResponse.matchAll(UNCHECKED_TODO_PATTERN)];
      let newTodosCount = 0;

      for (const match of uncheckedMatches) {
        // Group 2 contains the description (group 1 is the prefix with indentation)
        const description = match[2]?.trim() ?? "";
        if (!description) continue;

        // Generate content-based ID for duplicate prevention
        const todoId = this.generateId(description);

        // Check if we already have this todo by ID (more reliable than description)
        if (todos.has(todoId)) {
          logger.debug("Duplicate todo skipped", { sessionId, description });
          continue;
        }

        // Also check by normalized description for fuzzy matching
        const existingTodo = this.findTodoByDescription(sessionId, description);
        if (existingTodo) {
          logger.debug("Similar todo already exists", { sessionId, description });
          continue;
        }

        const todo: TodoItem = {
          id: todoId,
          description,
          createdAt: Date.now(),
        };
        todos.set(todo.id, todo);
        newTodosCount++;
        logger.debug("Todo detected", { sessionId, description, nested: match[1]?.startsWith(" ") || match[1]?.startsWith("\t") });
      }

      // Parse checked todos (completed tasks in same response)
      const checkedMatches = [...aiResponse.matchAll(CHECKED_TODO_PATTERN)];

      for (const match of checkedMatches) {
        const description = match[2]?.trim() ?? "";
        if (!description) continue;

        const existingTodo = this.findTodoByDescription(sessionId, description);

        if (existingTodo && !existingTodo.completedAt) {
          existingTodo.completedAt = Date.now();
          logger.debug("Todo completed via checkbox", { sessionId, description });
        }
      }

      // Parse in-progress todos (mark as created but not completed)
      const inProgressMatches = [...aiResponse.matchAll(IN_PROGRESS_TODO_PATTERN)];

      for (const match of inProgressMatches) {
        const description = match[2]?.trim() ?? "";
        if (!description) continue;

        const todoId = this.generateId(description);
        if (todos.has(todoId)) continue;

        const existingTodo = this.findTodoByDescription(sessionId, description);
        if (existingTodo) continue;

        const todo: TodoItem = {
          id: todoId,
          description,
          createdAt: Date.now(),
        };
        todos.set(todo.id, todo);
        newTodosCount++;
        logger.debug("In-progress todo detected", { sessionId, description });
      }

      // Detect completion phrases in subsequent responses
      this.detectCompletionPhrases(aiResponse, sessionId);

      // Update session state with current counts
      this.syncSessionState(sessionId);

      return newTodosCount;
    } catch (error) {
      logger.error("Todo detection error", { sessionId, error: String(error) });
      return 0;
    }
  }

  /**
   * Detect todo completion from phrases in AI responses.
   * Matches phrases like "completed X", "finished the Y task", etc.
   *
   * @param aiResponse - The AI response text to scan
   * @param sessionId - The session to check todos for
   * @returns Number of todos marked as completed
   */
  detectCompletionPhrases(aiResponse: string, sessionId: string): number {
    const todos = this.sessionTodos.get(sessionId);
    if (!todos || todos.size === 0) return 0;

    let completedCount = 0;

    for (const pattern of COMPLETION_PHRASE_PATTERNS) {
      // Reset regex state
      pattern.lastIndex = 0;
      const matches = [...aiResponse.matchAll(pattern)];

      for (const match of matches) {
        const phrase = match[1]?.trim();
        if (!phrase) continue;

        // Try to find a matching pending todo
        for (const todo of todos.values()) {
          if (todo.completedAt) continue;

          // Check if the phrase matches or is contained in the todo description
          const normalizedPhrase = phrase.toLowerCase();
          const normalizedDesc = todo.description.toLowerCase();

          if (
            normalizedDesc.includes(normalizedPhrase) ||
            normalizedPhrase.includes(normalizedDesc) ||
            this.fuzzyMatch(normalizedPhrase, normalizedDesc)
          ) {
            todo.completedAt = Date.now();
            completedCount++;
            logger.debug("Todo completed via phrase detection", {
              sessionId,
              description: todo.description,
              phrase,
            });
            break; // Only complete one todo per phrase match
          }
        }
      }
    }

    if (completedCount > 0) {
      this.syncSessionState(sessionId);
    }

    return completedCount;
  }

  /**
   * Simple fuzzy matching for todo descriptions.
   * Checks if significant words overlap between two strings.
   *
   * @param a - First string
   * @param b - Second string
   * @returns True if strings are similar enough
   */
  private fuzzyMatch(a: string, b: string): boolean {
    // Extract significant words (3+ characters)
    const wordsA = new Set(a.match(/\b\w{3,}\b/g) ?? []);
    const wordsB = new Set(b.match(/\b\w{3,}\b/g) ?? []);

    if (wordsA.size === 0 || wordsB.size === 0) return false;

    // Count overlapping words
    let overlap = 0;
    for (const word of wordsA) {
      if (wordsB.has(word)) overlap++;
    }

    // Require at least 50% overlap of the smaller set
    const minSize = Math.min(wordsA.size, wordsB.size);
    return overlap >= minSize * 0.5;
  }

  /**
   * Check if there are pending todos that should block session stop.
   *
   * @param sessionId - The session to check
   * @returns Result indicating if stop is allowed and any blocking reason
   */
  async checkPendingTodos(sessionId: string): Promise<PendingTodosResult> {
    try {
      const todos = this.sessionTodos.get(sessionId);

      if (!todos || todos.size === 0) {
        return {
          allow: true,
          pendingCount: 0,
          pendingTodos: [],
        };
      }

      const pending: TodoItem[] = [];
      for (const todo of todos.values()) {
        if (!todo.completedAt) {
          pending.push(todo);
        }
      }

      if (pending.length === 0) {
        return {
          allow: true,
          pendingCount: 0,
          pendingTodos: [],
        };
      }

      const summary = this.formatTodoSummary(pending);
      const pendingDescriptions = pending.map((t) => t.description);

      return {
        allow: false,
        reason: `Cannot stop: ${pending.length} pending todo(s)\n\n${summary}\n\nPlease complete or remove todos before stopping.`,
        pendingCount: pending.length,
        pendingTodos: pendingDescriptions,
      };
    } catch (error) {
      logger.error("Todo check error", { sessionId, error: String(error) });
      // Fail open - don't block stop if we can't check todos
      return {
        allow: true,
        pendingCount: 0,
        pendingTodos: [],
      };
    }
  }

  /**
   * Mark a specific todo as completed by ID.
   *
   * @param sessionId - The session containing the todo
   * @param todoId - The ID of the todo to complete
   * @returns true if the todo was found and marked complete, false otherwise
   */
  completeTodo(sessionId: string, todoId: string): boolean {
    const todos = this.sessionTodos.get(sessionId);
    if (!todos) return false;

    const todo = todos.get(todoId);
    if (!todo || todo.completedAt) return false;

    todo.completedAt = Date.now();
    this.syncSessionState(sessionId);
    logger.debug("Todo marked complete", { sessionId, todoId });
    return true;
  }

  /**
   * Mark a todo as completed by matching description.
   *
   * @param sessionId - The session containing the todo
   * @param description - The description to match
   * @returns true if a matching todo was found and completed
   */
  completeTodoByDescription(sessionId: string, description: string): boolean {
    const todo = this.findTodoByDescription(sessionId, description);
    if (!todo || todo.completedAt) return false;

    todo.completedAt = Date.now();
    this.syncSessionState(sessionId);
    logger.debug("Todo marked complete by description", { sessionId, description });
    return true;
  }

  /**
   * Remove a todo completely from tracking.
   *
   * @param sessionId - The session containing the todo
   * @param todoId - The ID of the todo to remove
   * @returns true if the todo was found and removed
   */
  removeTodo(sessionId: string, todoId: string): boolean {
    const todos = this.sessionTodos.get(sessionId);
    if (!todos) return false;

    const removed = todos.delete(todoId);
    if (removed) {
      this.syncSessionState(sessionId);
      logger.debug("Todo removed", { sessionId, todoId });
    }
    return removed;
  }

  /**
   * Get all todos for a session.
   *
   * @param sessionId - The session to get todos for
   * @returns Array of all TodoItems for the session
   */
  getTodos(sessionId: string): TodoItem[] {
    const todos = this.sessionTodos.get(sessionId);
    return todos ? Array.from(todos.values()) : [];
  }

  /**
   * Get only pending (incomplete) todos for a session.
   *
   * @param sessionId - The session to get pending todos for
   * @returns Array of pending TodoItems
   */
  getPendingTodos(sessionId: string): TodoItem[] {
    return this.getTodos(sessionId).filter((t) => !t.completedAt);
  }

  /**
   * Get only completed todos for a session.
   *
   * @param sessionId - The session to get completed todos for
   * @returns Array of completed TodoItems
   */
  getCompletedTodos(sessionId: string): TodoItem[] {
    return this.getTodos(sessionId).filter((t) => t.completedAt);
  }

  /**
   * Clear all todos for a session.
   * Called during session cleanup.
   *
   * @param sessionId - The session to clear todos for
   */
  clearSessionTodos(sessionId: string): void {
    this.sessionTodos.delete(sessionId);
    logger.debug("Session todos cleared", { sessionId });
  }

  /**
   * Get a summary of todo status for a session.
   *
   * @param sessionId - The session to summarize
   * @returns Object with total, pending, and completed counts
   */
  getTodoSummary(sessionId: string): {
    total: number;
    pending: number;
    completed: number;
  } {
    const todos = this.getTodos(sessionId);
    const completed = todos.filter((t) => t.completedAt).length;

    return {
      total: todos.length,
      pending: todos.length - completed,
      completed,
    };
  }

  /**
   * Format pending todos as a markdown summary.
   *
   * @param todos - Array of TodoItems to format
   * @returns Markdown-formatted todo list
   */
  formatTodoSummary(todos: TodoItem[]): string {
    return todos.map((todo) => `- [ ] ${todo.description}`).join("\n");
  }

  /**
   * Generate a content-based ID for a todo.
   * Uses SHA-256 hash of normalized description for stable, deterministic IDs.
   * This prevents duplicates across context compactions and session restores.
   *
   * @param description - The todo description to hash
   * @returns Unique todo ID string based on content hash
   */
  private generateId(description: string): string {
    // Normalize the description: lowercase, collapse whitespace, trim
    const normalized = description.toLowerCase().replace(/\s+/g, " ").trim();

    // Create SHA-256 hash and take first 12 characters for reasonable uniqueness
    const hash = createHash("sha256").update(normalized).digest("hex").substring(0, 12);

    return `todo-${hash}`;
  }

  /**
   * Get or create the todo Map for a session.
   *
   * @param sessionId - The session ID
   * @returns Map of todoId -> TodoItem
   */
  private getOrCreateTodoMap(sessionId: string): Map<string, TodoItem> {
    let todos = this.sessionTodos.get(sessionId);
    if (!todos) {
      todos = new Map();
      this.sessionTodos.set(sessionId, todos);
    }
    return todos;
  }

  /**
   * Find a todo by its description (case-insensitive partial match).
   *
   * @param sessionId - The session to search in
   * @param description - The description to match
   * @returns Matching TodoItem or undefined
   */
  private findTodoByDescription(
    sessionId: string,
    description: string
  ): TodoItem | undefined {
    const todos = this.sessionTodos.get(sessionId);
    if (!todos) return undefined;

    const normalizedDesc = description.toLowerCase().trim();

    for (const todo of todos.values()) {
      if (todo.description.toLowerCase().trim() === normalizedDesc) {
        return todo;
      }
    }
    return undefined;
  }

  /**
   * Sync todo counts to SessionManager state.
   *
   * @param sessionId - The session to sync
   */
  private syncSessionState(sessionId: string): void {
    const summary = this.getTodoSummary(sessionId);
    SessionManager.updateTodos(sessionId, summary.total, summary.completed);
  }
}

/**
 * Singleton instance of TodoEnforcer for global use.
 */
export const todoEnforcer = new TodoEnforcer();

/**
 * Factory function to create a new TodoEnforcer instance.
 * Useful for testing or isolated use cases.
 *
 * @returns New TodoEnforcer instance
 */
export function createTodoEnforcer(): TodoEnforcer {
  return new TodoEnforcer();
}
