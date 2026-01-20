# Quick Start Guide

Get up and running with Atreides OpenCode in under 5 minutes.

## 1. Install

```bash
cd your-project
npx atreides-opencode init
```

## 2. Follow the Wizard

Accept the defaults or customize:

```
Detecting project type... TypeScript
Is this correct? [Y/n] y

Choose installation mode:
  ( ) Minimal
  (*) Standard (recommended)
  ( ) Full

Select mode: [Enter]

Configure AI models for agents...
[Accept recommended models or customize]

Configure permissions...
[Accept recommended permissions or customize]

Proceed with initialization? [Y/n] y

Atreides OpenCode initialized successfully!
```

## 3. Verify

```bash
npx atreides-opencode doctor
```

You should see all checks passing.

## 4. Start Using

Open your project in OpenCode. The AI assistant will now follow Atreides orchestration:

- **Structured workflow** through Intent → Assessment → Exploration → Implementation → Verification
- **Agent delegation** for specialized tasks
- **Error recovery** with the 3-strike protocol
- **Todo enforcement** for complex tasks

## What Happens During AI Sessions

### Workflow Phases

When you ask the AI to do something, Atreides guides it through phases:

**Intent Phase**
```
User: Add a user authentication system

AI: I understand you want to add user authentication. Let me clarify:
- What auth method? (JWT, sessions, OAuth)
- What user data needs to be stored?
- Are there existing patterns to follow?
```

**Assessment Phase**
```
AI: This is a medium-complexity task that will require:
- Database schema changes
- New API endpoints
- Frontend login components
- Security considerations
```

**Exploration Phase**
```
AI: Let me explore the codebase to understand existing patterns...
[Delegates to Explore agent]
Found: existing user model, API route patterns, frontend component structure
```

**Implementation Phase**
```
AI: Creating task list:
- [ ] Create user schema
- [ ] Add auth endpoints
- [ ] Create login component
- [ ] Add middleware
- [ ] Write tests

Starting with user schema...
```

**Verification Phase**
```
AI: Changes complete. Let me verify:
- Tests passing
- Build successful
- No security vulnerabilities detected
All tasks completed.
```

### Agent Delegation

The AI delegates specialized work:

```
AI: This requires architecture planning. Delegating to Plan agent...

[Plan Agent]: Analyzing authentication approaches...
Recommendation: JWT with refresh tokens
Rationale: Stateless, scalable, works with your API structure
```

### Error Recovery

If something fails:

```
AI: [Strike 1] Build failed with TypeScript errors.
Analyzing... Found missing type definition.
Fixing...

AI: [Strike 2] Build still failing.
Trying alternative approach...

AI: [Strike 3] Unable to resolve automatically.
Requesting guidance: The type error in auth.ts line 42 needs your input.
```

## Common Workflows

### Feature Development

```
User: Add a dark mode toggle

AI follows: Intent → Assessment → Exploration → Implementation → Verification
Creates todo list, makes changes systematically, verifies with tests
```

### Bug Fixing

```
User: Fix the login redirect bug

AI follows: Intent → Assessment → Exploration → Implementation → Verification
Identifies bug, explores related code, implements fix, verifies
```

### Refactoring

```
User: Refactor the user service to use dependency injection

AI: Delegating to Plan agent for architecture decision...
[Plan agent provides approach]
AI: Creating task list and implementing systematically
```

### Code Review

```
User: Review my recent changes for security issues

AI: Delegating to Stilgar agent for security analysis...
[Stilgar analyzes and reports findings]
```

## Customizing Behavior

### Edit AGENTS.md

Add custom rules to `AGENTS.md`:

```markdown
## Custom Rules

### Project-Specific
- Always use Prisma for database operations
- Follow the existing error handling pattern in utils/errors.ts
- Run `npm run lint` after code changes
```

### Configure Agents

Edit `.opencode/agent/{agent}.md` to customize agent behavior:

```markdown
---
name: explore
model: claude-haiku-4-5
---

# Explore Agent

When exploring this project, always check:
1. The /src/components directory for React patterns
2. The /api directory for endpoint conventions
```

### Adjust Permissions

Edit `opencode.json`:

```json
{
  "atreides": {
    "permissions": {
      "bash": {
        "allow": ["npm *", "npx *", "docker-compose *"],
        "deny": ["rm -rf *"]
      }
    }
  }
}
```

## Tips for Best Results

### Be Specific

Instead of:
```
Make the app faster
```

Try:
```
Optimize the product listing page - it's loading slowly due to database queries
```

### Provide Context

```
Add pagination to the users API endpoint.
Context: We're using Prisma and expect up to 100k users.
```

### Let Atreides Guide

Don't micromanage. Let the AI use its workflow:

```
User: Add tests for the auth module
AI: [Follows workflow, delegates to Build agent for test patterns]
```

### Review Delegations

When the AI delegates:

```
AI: Delegating to Explore agent to find all authentication-related files...

[Review the delegation results before the AI continues]
```

## Next Steps

- [Configuration Guide](configuration.md) - Customize all options
- [CLI Reference](cli-reference.md) - Available commands
- [Examples](examples.md) - Real-world usage patterns
- [Troubleshooting](troubleshooting.md) - Common issues
