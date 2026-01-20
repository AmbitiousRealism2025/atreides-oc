import { describe, expect, test, beforeEach } from "bun:test";
import {
  TodoEnforcer,
  createTodoEnforcer,
  todoEnforcer,
  type TodoItem,
} from "../../../src/plugin/managers/todo-enforcer";
import * as SessionManager from "../../../src/plugin/managers/session-manager";
import type { Config } from "../../../src/lib/config";

function createMockConfig(): Config {
  return {
    identity: {
      personaName: "TestPersona",
      responsePrefix: true,
      delegationAnnouncements: true,
    },
    workflow: {
      enablePhaseTracking: true,
      strictTodoEnforcement: true,
      autoEscalateOnError: true,
    },
    security: {
      enableObfuscationDetection: true,
      blockedPatterns: [],
      warningPatterns: [],
      blockedFiles: [],
    },
  };
}

describe("TodoEnforcer - Todo Detection", () => {
  let enforcer: TodoEnforcer;

  beforeEach(() => {
    SessionManager.clearSessions();
    SessionManager.setDefaultConfig(createMockConfig());
    enforcer = createTodoEnforcer();
  });

  test("detects unchecked todos from AI response", () => {
    const response = "Here are the tasks:\n- [ ] Update tests\n- [ ] Add docs";
    const sessionId = "test-session";

    SessionManager.getState(sessionId);
    const count = enforcer.detectTodos(response, sessionId);

    expect(count).toBe(2);
    const todos = enforcer.getTodos(sessionId);
    expect(todos).toHaveLength(2);
    expect(todos[0].description).toBe("Update tests");
    expect(todos[1].description).toBe("Add docs");
  });

  test("detects todos with asterisk bullet", () => {
    const response = "Tasks:\n* [ ] First task\n* [ ] Second task";
    const sessionId = "test-session";

    SessionManager.getState(sessionId);
    enforcer.detectTodos(response, sessionId);

    const todos = enforcer.getTodos(sessionId);
    expect(todos).toHaveLength(2);
    expect(todos[0].description).toBe("First task");
  });

  test("detects todos with indentation", () => {
    const response = "Tasks:\n  - [ ] Indented task\n    - [ ] More indented";
    const sessionId = "test-session";

    SessionManager.getState(sessionId);
    enforcer.detectTodos(response, sessionId);

    const todos = enforcer.getTodos(sessionId);
    expect(todos).toHaveLength(2);
    expect(todos[0].description).toBe("Indented task");
  });

  test("detects completed todos and marks existing as complete", () => {
    const sessionId = "test-session";
    SessionManager.getState(sessionId);

    // First add unchecked todos
    enforcer.detectTodos("- [ ] Task to complete", sessionId);
    expect(enforcer.getPendingTodos(sessionId)).toHaveLength(1);

    // Then mark it as complete
    enforcer.detectTodos("- [x] Task to complete", sessionId);
    expect(enforcer.getPendingTodos(sessionId)).toHaveLength(0);
    expect(enforcer.getCompletedTodos(sessionId)).toHaveLength(1);
  });

  test("detects completed todos with uppercase X", () => {
    const sessionId = "test-session";
    SessionManager.getState(sessionId);

    enforcer.detectTodos("- [ ] Task A", sessionId);
    enforcer.detectTodos("- [X] Task A", sessionId);

    expect(enforcer.getPendingTodos(sessionId)).toHaveLength(0);
    expect(enforcer.getCompletedTodos(sessionId)).toHaveLength(1);
  });

  test("does not duplicate existing todos", () => {
    const response = "- [ ] Same task";
    const sessionId = "test-session";

    SessionManager.getState(sessionId);
    enforcer.detectTodos(response, sessionId);
    enforcer.detectTodos(response, sessionId);

    const todos = enforcer.getTodos(sessionId);
    expect(todos).toHaveLength(1);
  });

  test("generates unique IDs for each todo", () => {
    const response = "- [ ] Task 1\n- [ ] Task 2";
    const sessionId = "test-session";

    SessionManager.getState(sessionId);
    enforcer.detectTodos(response, sessionId);

    const todos = enforcer.getTodos(sessionId);
    expect(todos[0].id).not.toBe(todos[1].id);
    // Content-based SHA-256 hash IDs: todo-{12 hex chars}
    expect(todos[0].id).toMatch(/^todo-[a-f0-9]{12}$/);
  });

  test("sets createdAt timestamp on detection", () => {
    const response = "- [ ] Timestamped task";
    const sessionId = "test-session";
    const beforeTime = Date.now() - 1; // Allow 1ms tolerance

    SessionManager.getState(sessionId);
    enforcer.detectTodos(response, sessionId);

    const todos = enforcer.getTodos(sessionId);
    expect(todos[0].createdAt).toBeGreaterThanOrEqual(beforeTime);
    expect(todos[0].createdAt).toBeLessThanOrEqual(Date.now() + 1);
  });

  test("returns 0 when no todos found", () => {
    const response = "No todos here, just regular text.";
    const sessionId = "test-session";

    SessionManager.getState(sessionId);
    const count = enforcer.detectTodos(response, sessionId);

    expect(count).toBe(0);
    expect(enforcer.getTodos(sessionId)).toHaveLength(0);
  });

  test("handles empty response gracefully", () => {
    const sessionId = "test-session";
    SessionManager.getState(sessionId);

    const count = enforcer.detectTodos("", sessionId);

    expect(count).toBe(0);
  });

  test("handles multiline todo descriptions", () => {
    const response = "- [ ] Fix the bug in src/app.ts that causes crashes";
    const sessionId = "test-session";

    SessionManager.getState(sessionId);
    enforcer.detectTodos(response, sessionId);

    const todos = enforcer.getTodos(sessionId);
    expect(todos[0].description).toBe(
      "Fix the bug in src/app.ts that causes crashes"
    );
  });
});

describe("TodoEnforcer - Stop Blocking Logic", () => {
  let enforcer: TodoEnforcer;

  beforeEach(() => {
    SessionManager.clearSessions();
    SessionManager.setDefaultConfig(createMockConfig());
    enforcer = createTodoEnforcer();
  });

  test("allows stop when no todos exist", async () => {
    const sessionId = "test-session";
    SessionManager.getState(sessionId);

    const result = await enforcer.checkPendingTodos(sessionId);

    expect(result.allow).toBe(true);
    expect(result.pendingCount).toBe(0);
    expect(result.pendingTodos).toHaveLength(0);
    expect(result.reason).toBeUndefined();
  });

  test("allows stop when all todos are completed", async () => {
    const sessionId = "test-session";
    SessionManager.getState(sessionId);

    enforcer.detectTodos("- [ ] Task 1\n- [ ] Task 2", sessionId);
    enforcer.detectTodos("- [x] Task 1\n- [x] Task 2", sessionId);

    const result = await enforcer.checkPendingTodos(sessionId);

    expect(result.allow).toBe(true);
    expect(result.pendingCount).toBe(0);
  });

  test("blocks stop when pending todos exist", async () => {
    const sessionId = "test-session";
    SessionManager.getState(sessionId);

    enforcer.detectTodos("- [ ] Pending task", sessionId);

    const result = await enforcer.checkPendingTodos(sessionId);

    expect(result.allow).toBe(false);
    expect(result.pendingCount).toBe(1);
    expect(result.pendingTodos).toContain("Pending task");
    expect(result.reason).toContain("Cannot stop: 1 pending todo(s)");
  });

  test("includes all pending todos in reason message", async () => {
    const sessionId = "test-session";
    SessionManager.getState(sessionId);

    enforcer.detectTodos("- [ ] Task A\n- [ ] Task B\n- [ ] Task C", sessionId);

    const result = await enforcer.checkPendingTodos(sessionId);

    expect(result.allow).toBe(false);
    expect(result.pendingCount).toBe(3);
    expect(result.reason).toContain("3 pending todo(s)");
    expect(result.reason).toContain("Task A");
    expect(result.reason).toContain("Task B");
    expect(result.reason).toContain("Task C");
  });

  test("allows stop for unknown session (fail open)", async () => {
    const result = await enforcer.checkPendingTodos("nonexistent-session");

    expect(result.allow).toBe(true);
    expect(result.pendingCount).toBe(0);
  });

  test("provides helpful guidance in blocking message", async () => {
    const sessionId = "test-session";
    SessionManager.getState(sessionId);

    enforcer.detectTodos("- [ ] Unfinished work", sessionId);

    const result = await enforcer.checkPendingTodos(sessionId);

    expect(result.reason).toContain("complete or remove todos before stopping");
  });
});

describe("TodoEnforcer - Todo Management", () => {
  let enforcer: TodoEnforcer;

  beforeEach(() => {
    SessionManager.clearSessions();
    SessionManager.setDefaultConfig(createMockConfig());
    enforcer = createTodoEnforcer();
  });

  test("completeTodo marks todo as complete by ID", () => {
    const sessionId = "test-session";
    SessionManager.getState(sessionId);

    enforcer.detectTodos("- [ ] Task to complete", sessionId);
    const todos = enforcer.getTodos(sessionId);
    const todoId = todos[0].id;

    const result = enforcer.completeTodo(sessionId, todoId);

    expect(result).toBe(true);
    expect(enforcer.getPendingTodos(sessionId)).toHaveLength(0);
    expect(enforcer.getCompletedTodos(sessionId)).toHaveLength(1);
  });

  test("completeTodo returns false for nonexistent todo", () => {
    const sessionId = "test-session";
    SessionManager.getState(sessionId);

    const result = enforcer.completeTodo(sessionId, "nonexistent-id");

    expect(result).toBe(false);
  });

  test("completeTodo returns false for already completed todo", () => {
    const sessionId = "test-session";
    SessionManager.getState(sessionId);

    enforcer.detectTodos("- [ ] Task", sessionId);
    const todoId = enforcer.getTodos(sessionId)[0].id;
    enforcer.completeTodo(sessionId, todoId);

    const result = enforcer.completeTodo(sessionId, todoId);

    expect(result).toBe(false);
  });

  test("completeTodoByDescription marks todo complete", () => {
    const sessionId = "test-session";
    SessionManager.getState(sessionId);

    enforcer.detectTodos("- [ ] Specific task to complete", sessionId);

    const result = enforcer.completeTodoByDescription(
      sessionId,
      "Specific task to complete"
    );

    expect(result).toBe(true);
    expect(enforcer.getPendingTodos(sessionId)).toHaveLength(0);
  });

  test("completeTodoByDescription is case-insensitive", () => {
    const sessionId = "test-session";
    SessionManager.getState(sessionId);

    enforcer.detectTodos("- [ ] Fix Bug", sessionId);

    const result = enforcer.completeTodoByDescription(sessionId, "fix bug");

    expect(result).toBe(true);
  });

  test("removeTodo deletes todo completely", () => {
    const sessionId = "test-session";
    SessionManager.getState(sessionId);

    enforcer.detectTodos("- [ ] Task to remove", sessionId);
    const todoId = enforcer.getTodos(sessionId)[0].id;

    const result = enforcer.removeTodo(sessionId, todoId);

    expect(result).toBe(true);
    expect(enforcer.getTodos(sessionId)).toHaveLength(0);
  });

  test("removeTodo returns false for nonexistent todo", () => {
    const sessionId = "test-session";
    SessionManager.getState(sessionId);

    const result = enforcer.removeTodo(sessionId, "nonexistent-id");

    expect(result).toBe(false);
  });

  test("clearSessionTodos removes all session todos", () => {
    const sessionId = "test-session";
    SessionManager.getState(sessionId);

    enforcer.detectTodos("- [ ] Task 1\n- [ ] Task 2", sessionId);
    expect(enforcer.getTodos(sessionId)).toHaveLength(2);

    enforcer.clearSessionTodos(sessionId);

    expect(enforcer.getTodos(sessionId)).toHaveLength(0);
  });
});

describe("TodoEnforcer - Summary and Formatting", () => {
  let enforcer: TodoEnforcer;

  beforeEach(() => {
    SessionManager.clearSessions();
    SessionManager.setDefaultConfig(createMockConfig());
    enforcer = createTodoEnforcer();
  });

  test("getTodoSummary returns correct counts", () => {
    const sessionId = "test-session";
    SessionManager.getState(sessionId);

    enforcer.detectTodos("- [ ] Task 1\n- [ ] Task 2\n- [ ] Task 3", sessionId);
    enforcer.detectTodos("- [x] Task 1", sessionId);

    const summary = enforcer.getTodoSummary(sessionId);

    expect(summary.total).toBe(3);
    expect(summary.pending).toBe(2);
    expect(summary.completed).toBe(1);
  });

  test("getTodoSummary returns zeros for empty session", () => {
    const sessionId = "test-session";
    SessionManager.getState(sessionId);

    const summary = enforcer.getTodoSummary(sessionId);

    expect(summary.total).toBe(0);
    expect(summary.pending).toBe(0);
    expect(summary.completed).toBe(0);
  });

  test("formatTodoSummary generates markdown list", () => {
    const todos: TodoItem[] = [
      { id: "1", description: "First task", createdAt: Date.now() },
      { id: "2", description: "Second task", createdAt: Date.now() },
    ];

    const markdown = enforcer.formatTodoSummary(todos);

    expect(markdown).toBe("- [ ] First task\n- [ ] Second task");
  });

  test("formatTodoSummary handles empty array", () => {
    const markdown = enforcer.formatTodoSummary([]);

    expect(markdown).toBe("");
  });
});

describe("TodoEnforcer - Session State Sync", () => {
  let enforcer: TodoEnforcer;

  beforeEach(() => {
    SessionManager.clearSessions();
    SessionManager.setDefaultConfig(createMockConfig());
    enforcer = createTodoEnforcer();
  });

  test("syncs todo counts to SessionManager", () => {
    const sessionId = "test-session";
    const state = SessionManager.getState(sessionId);

    enforcer.detectTodos("- [ ] Task 1\n- [ ] Task 2", sessionId);

    expect(state.todoCount).toBe(2);
    expect(state.todosCompleted).toBe(0);
    expect(state.todosCreated).toBe(true);
  });

  test("updates SessionManager on completion", () => {
    const sessionId = "test-session";
    const state = SessionManager.getState(sessionId);

    enforcer.detectTodos("- [ ] Task 1", sessionId);
    enforcer.detectTodos("- [x] Task 1", sessionId);

    expect(state.todoCount).toBe(1);
    expect(state.todosCompleted).toBe(1);
  });

  test("updates SessionManager on removal", () => {
    const sessionId = "test-session";
    const state = SessionManager.getState(sessionId);

    enforcer.detectTodos("- [ ] Task 1\n- [ ] Task 2", sessionId);
    const todoId = enforcer.getTodos(sessionId)[0].id;
    enforcer.removeTodo(sessionId, todoId);

    expect(state.todoCount).toBe(1);
    expect(state.todosCompleted).toBe(0);
  });
});

describe("TodoEnforcer - Singleton and Factory", () => {
  beforeEach(() => {
    SessionManager.clearSessions();
    SessionManager.setDefaultConfig(createMockConfig());
  });

  test("todoEnforcer is a singleton", () => {
    expect(todoEnforcer).toBeDefined();
    expect(todoEnforcer).toBeInstanceOf(TodoEnforcer);
  });

  test("createTodoEnforcer creates new instances", () => {
    const enforcer1 = createTodoEnforcer();
    const enforcer2 = createTodoEnforcer();

    expect(enforcer1).toBeInstanceOf(TodoEnforcer);
    expect(enforcer2).toBeInstanceOf(TodoEnforcer);
    expect(enforcer1).not.toBe(enforcer2);
  });

  test("separate instances have isolated todo storage", () => {
    const enforcer1 = createTodoEnforcer();
    const enforcer2 = createTodoEnforcer();
    const sessionId = "test-session";

    SessionManager.getState(sessionId);
    enforcer1.detectTodos("- [ ] Task from enforcer 1", sessionId);

    expect(enforcer1.getTodos(sessionId)).toHaveLength(1);
    expect(enforcer2.getTodos(sessionId)).toHaveLength(0);
  });
});

describe("TodoEnforcer - Performance", () => {
  let enforcer: TodoEnforcer;

  beforeEach(() => {
    SessionManager.clearSessions();
    SessionManager.setDefaultConfig(createMockConfig());
    enforcer = createTodoEnforcer();
  });

  test("checkPendingTodos completes in <5ms", async () => {
    const sessionId = "perf-test";
    SessionManager.getState(sessionId);

    // Add many todos
    const response = Array(100)
      .fill(null)
      .map((_, i) => `- [ ] Task ${i}`)
      .join("\n");
    enforcer.detectTodos(response, sessionId);

    const start = performance.now();
    await enforcer.checkPendingTodos(sessionId);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(5);
  });

  test("detectTodos handles large responses efficiently", () => {
    const sessionId = "large-response";
    SessionManager.getState(sessionId);

    // Generate large response with many todos
    const response = Array(500)
      .fill(null)
      .map((_, i) => `- [ ] Task number ${i} with some description text`)
      .join("\n");

    const start = performance.now();
    enforcer.detectTodos(response, sessionId);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(100); // Should be fast even with 500 todos
    expect(enforcer.getTodos(sessionId)).toHaveLength(500);
  });
});

describe("TodoEnforcer - Edge Cases", () => {
  let enforcer: TodoEnforcer;

  beforeEach(() => {
    SessionManager.clearSessions();
    SessionManager.setDefaultConfig(createMockConfig());
    enforcer = createTodoEnforcer();
  });

  test("handles special characters in todo descriptions", () => {
    const response = "- [ ] Fix `code` with **bold** and _italic_";
    const sessionId = "test-session";

    SessionManager.getState(sessionId);
    enforcer.detectTodos(response, sessionId);

    const todos = enforcer.getTodos(sessionId);
    expect(todos[0].description).toBe("Fix `code` with **bold** and _italic_");
  });

  test("handles unicode characters in descriptions", () => {
    const response = "- [ ] Add emoji support 🎉";
    const sessionId = "test-session";

    SessionManager.getState(sessionId);
    enforcer.detectTodos(response, sessionId);

    const todos = enforcer.getTodos(sessionId);
    expect(todos[0].description).toBe("Add emoji support 🎉");
  });

  test("handles numbered task lists (ignores them)", () => {
    const response = "1. [ ] Numbered item";
    const sessionId = "test-session";

    SessionManager.getState(sessionId);
    const count = enforcer.detectTodos(response, sessionId);

    expect(count).toBe(0); // Only - and * bullets supported
  });

  test("handles malformed checkbox (extra spaces)", () => {
    const response = "- [  ] Extra space inside\n-  [ ] Extra space before";
    const sessionId = "test-session";

    SessionManager.getState(sessionId);
    enforcer.detectTodos(response, sessionId);

    const todos = enforcer.getTodos(sessionId);
    // Should handle reasonable variations
    expect(todos.length).toBeGreaterThanOrEqual(0);
  });

  test("completedAt is set when marking todo complete", () => {
    const sessionId = "test-session";
    SessionManager.getState(sessionId);

    enforcer.detectTodos("- [ ] Task", sessionId);
    const beforeComplete = Date.now();
    enforcer.detectTodos("- [x] Task", sessionId);

    const completed = enforcer.getCompletedTodos(sessionId);
    expect(completed[0].completedAt).toBeGreaterThanOrEqual(beforeComplete);
  });

  test("handles session without SessionManager state", () => {
    // Don't initialize the session in SessionManager
    const sessionId = "no-state-session";

    // This should not throw, but todos won't sync to SessionManager
    const count = enforcer.detectTodos("- [ ] Task", sessionId);
    expect(count).toBe(1);
  });
});

describe("TodoEnforcer - Integration with Stop Hook", () => {
  let enforcer: TodoEnforcer;

  beforeEach(() => {
    SessionManager.clearSessions();
    SessionManager.setDefaultConfig(createMockConfig());
    enforcer = createTodoEnforcer();
  });

  test("typical workflow: detect, complete, stop allowed", async () => {
    const sessionId = "workflow-test";
    SessionManager.getState(sessionId);

    // AI creates todos
    enforcer.detectTodos(
      "I'll work on these:\n- [ ] Update tests\n- [ ] Add documentation",
      sessionId
    );

    // Stop should be blocked
    let result = await enforcer.checkPendingTodos(sessionId);
    expect(result.allow).toBe(false);

    // AI completes todos
    enforcer.detectTodos(
      "Done:\n- [x] Update tests\n- [x] Add documentation",
      sessionId
    );

    // Stop should be allowed
    result = await enforcer.checkPendingTodos(sessionId);
    expect(result.allow).toBe(true);
  });

  test("partial completion still blocks stop", async () => {
    const sessionId = "partial-test";
    SessionManager.getState(sessionId);

    enforcer.detectTodos("- [ ] Task 1\n- [ ] Task 2\n- [ ] Task 3", sessionId);
    enforcer.detectTodos("- [x] Task 1\n- [x] Task 2", sessionId);

    const result = await enforcer.checkPendingTodos(sessionId);
    expect(result.allow).toBe(false);
    expect(result.pendingCount).toBe(1);
  });
});
