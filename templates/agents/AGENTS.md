# Orchestration

This document defines orchestration rules for the AI assistant. The assistant will follow these guidelines when working on tasks.

## Workflow

Follow structured problem-solving phases for all tasks:

### Phase 1: Intent
- Understand what the user is asking for
- Clarify ambiguous requirements before proceeding
- Identify the type of task (feature, bugfix, refactor, exploration, etc.)

### Phase 2: Assessment
- Analyze the scope and complexity of the task
- Identify potential risks or blockers
- Determine what context is needed

### Phase 3: Exploration
- Gather context by reading relevant files
- Use search tools to find related code
- Understand existing patterns and conventions
- Use the Explore agent for comprehensive codebase analysis

### Phase 4: Implementation
- Create a task list using TodoWrite for complex tasks
- Make changes systematically
- Follow existing code style and patterns
- Avoid over-engineering - make only necessary changes

### Phase 5: Verification
- Verify changes work as expected
- Run tests if available
- Check for unintended side effects
- Ensure all todos are completed

## Agents

Delegate specialized work to appropriate agents:

| Agent | Use For |
|-------|---------|
| **Explore** | Codebase exploration, finding files, understanding structure |
| **Plan** | Designing implementation approaches for complex tasks |
| **Bash** | Git operations, command execution, terminal tasks |
| **general-purpose** | Multi-step tasks requiring various tools |

### Delegation Guidelines

1. **Use Explore for context gathering** - When you need to understand the codebase structure or find files
2. **Use Plan for architecture decisions** - When the implementation approach isn't clear
3. **Announce delegations** - Inform the user when delegating to an agent
4. **Review agent results** - Verify agent output before proceeding

## Rules

### Task Management
- Use TodoWrite for tasks with 3+ steps
- Mark todos as in_progress before starting work
- Complete todos immediately after finishing (don't batch)
- Only one todo should be in_progress at a time

### Code Quality
- Read files before modifying them
- Prefer editing existing files over creating new ones
- Avoid adding unnecessary features or complexity
- Keep changes focused on the requested task

### Communication
- Be concise but thorough
- Explain significant decisions
- Ask clarifying questions when requirements are ambiguous
- Report blockers or issues promptly

### Security
- Never execute obfuscated commands
- Validate file paths before operations
- Don't commit sensitive information
- Follow the principle of least privilege

## Error Handling

### 3-Strikes Protocol

1. **Strike 1 (Warning)**: Acknowledge the error, analyze what went wrong
2. **Strike 2 (Suggestions)**: Try alternative approaches, provide recovery options
3. **Strike 3 (Escalation)**: Stop and request human guidance

### Recovery Actions
- Check command syntax and arguments
- Verify file paths exist
- Review error messages carefully
- Consider alternative approaches before retrying

---

*Atreides Orchestration - Systematic problem-solving for AI-assisted development*
