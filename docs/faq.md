# Frequently Asked Questions

Common questions about Atreides OpenCode.

---

## General

### What is Atreides OpenCode?

Atreides OpenCode is an AI orchestration plugin for OpenCode that provides:

- **Structured workflows**: 5-phase development process
- **Agent delegation**: Specialized agents for different tasks
- **Error recovery**: 3-strike protocol with automatic escalation
- **Security hardening**: Command validation and obfuscation detection
- **Todo enforcement**: Task tracking for complex work

### Why is it called "Atreides"?

The name comes from Frank Herbert's Dune series. Like the Atreides house's strategic thinking and leadership, this plugin provides structured orchestration and intelligent delegation for AI-assisted development.

### What's the difference between Atreides and plain OpenCode?

| Feature | Plain OpenCode | With Atreides |
|---------|----------------|---------------|
| Workflow | Unstructured | 5-phase structured |
| Delegation | Manual | Automatic to specialized agents |
| Error handling | Basic | 3-strike protocol |
| Security | Default | Multi-layer validation |
| Task tracking | Optional | Enforced for complex tasks |

### Is Atreides free?

Yes, Atreides OpenCode is open source under the MIT license.

---

## Installation

### What are the requirements?

- Node.js >= 20.0.0 or Bun >= 1.0.0
- OpenCode with plugin support

### Can I use Atreides without OpenCode?

No, Atreides is a plugin for OpenCode. It requires OpenCode to function.

### How do I update Atreides?

```bash
npx atreides-opencode update
```

This updates while preserving your customizations.

### Can I install Atreides in an existing project?

Yes, run `npx atreides-opencode init`. It will detect existing configuration and offer to merge with your customizations.

---

## Configuration

### Where is the configuration stored?

- `opencode.json` - Main configuration
- `AGENTS.md` - Orchestration rules (injected into AI system prompt)
- `.opencode/agent/*.md` - Individual agent definitions

### How do I customize the AI persona name?

Edit `opencode.json`:

```json
{
  "atreides": {
    "identity": {
      "personaName": "YourName"
    }
  }
}
```

### Can I disable specific features?

Yes, in `opencode.json`:

```json
{
  "atreides": {
    "workflow": { "enabled": false },
    "todoEnforcement": { "enabled": false },
    "errorRecovery": { "enabled": false }
  }
}
```

### How do I add custom orchestration rules?

Add them to the "Custom Rules" section in `AGENTS.md`:

```markdown
## Custom Rules

### My Project Rule
Always use TypeScript strict mode.
```

---

## Workflow

### What are the 5 workflow phases?

1. **Intent**: Understand what the user wants
2. **Assessment**: Analyze scope and complexity
3. **Exploration**: Gather context from codebase
4. **Implementation**: Make changes systematically
5. **Verification**: Verify changes work correctly

### Can I skip workflow phases?

The workflow is enforced by default, but you can disable it:

```json
{
  "atreides": {
    "workflow": {
      "enforcePhaseOrder": false
    }
  }
}
```

### Why does the AI ask clarifying questions?

During the Intent phase, the AI clarifies requirements to ensure it understands what you want before proceeding. This prevents wasted effort on misunderstood tasks.

---

## Agents

### What agents are available?

| Agent | Purpose |
|-------|---------|
| **Stilgar** | Architecture decisions, complex debugging |
| **Explore** | Fast codebase exploration |
| **Librarian** | Documentation and research |
| **Build** | Compilation, testing, CI/CD |
| **Plan** | Implementation planning |

### Can I add custom agents?

Yes, create a new file in `.opencode/agent/`:

```markdown
---
name: my-agent
displayName: My Agent
model: claude-sonnet-4
description: Custom agent for specific tasks
---

# My Agent

[Agent definition]
```

### How do I change which model an agent uses?

Edit the agent's definition file in `.opencode/agent/{agent}.md`:

```markdown
---
name: stilgar
model: claude-opus-4  # Change this
---
```

### Why isn't the AI delegating to agents?

Check that:
1. Agents are enabled in `opencode.json`
2. Agent files exist in `.opencode/agent/`
3. The task is appropriate for delegation

Run `npx atreides-opencode doctor --check agents` to diagnose.

---

## Error Recovery

### What is the 3-strike protocol?

When the AI encounters errors:

1. **Strike 1**: Acknowledge error, analyze what went wrong
2. **Strike 2**: Try alternative approaches
3. **Strike 3**: Stop and request human guidance

### Can I change the strike limit?

Yes, in `opencode.json`:

```json
{
  "atreides": {
    "errorRecovery": {
      "maxStrikes": 5
    }
  }
}
```

### What happens after 3 strikes?

The AI escalates to you for guidance. It explains what it tried and asks for help deciding next steps.

---

## Security

### What security features does Atreides include?

- **Command validation**: Blocks dangerous commands
- **Obfuscation detection**: Detects URL-encoded, hex, and quote-stripped commands
- **File guards**: Protects sensitive files
- **Log sanitization**: Scrubs credentials from logs

### What commands are blocked?

By default, dangerous commands like:
- `rm -rf /`
- `mkfs *`
- Fork bombs
- Sudo commands (configurable)

### How do I allow a blocked command?

Add it to the allow list in `opencode.json`:

```json
{
  "atreides": {
    "permissions": {
      "bash": {
        "allow": ["your-command *"]
      }
    }
  }
}
```

### Can I disable security features?

Not recommended, but possible:

```json
{
  "atreides": {
    "security": {
      "blockedPatterns": false,
      "obfuscationDetection": false
    }
  }
}
```

---

## Todo Enforcement

### Why does the AI create todo lists?

For complex tasks (3+ steps by default), todo lists help:
- Track progress
- Ensure nothing is forgotten
- Provide visibility to you

### Can I disable todo enforcement?

Yes:

```json
{
  "atreides": {
    "todoEnforcement": {
      "enabled": false
    }
  }
}
```

### How do I change when todos are created?

Adjust the minimum steps threshold:

```json
{
  "atreides": {
    "todoEnforcement": {
      "minStepsForList": 5
    }
  }
}
```

---

## Troubleshooting

### How do I check if Atreides is working?

```bash
npx atreides-opencode doctor
```

### Where are logs stored?

Enable debug logging:

```bash
ATREIDES_DEBUG=true opencode
```

Logs appear in the terminal output.

### How do I report a bug?

1. Run `npx atreides-opencode doctor --json`
2. Include the output in your bug report
3. Report at https://github.com/atreides/atreides-opencode/issues

### How do I reset Atreides to defaults?

```bash
# Backup first
cp -r .opencode/ .opencode.backup/
cp AGENTS.md AGENTS.md.backup

# Reinitialize
rm -rf .opencode/ AGENTS.md
npx atreides-opencode init
```

---

## Customization

### Can I use different AI models?

Yes, configure models per agent in `.opencode/agent/{agent}.md` or globally in `opencode.json`.

### How do I add project-specific rules?

Add to `AGENTS.md`:

```markdown
## Custom Rules

### My Project
- Use React for frontend
- Use Prisma for database
- Run tests before commits
```

### Can I customize the workflow phases?

The phases are fixed (Intent → Assessment → Exploration → Implementation → Verification), but you can customize what happens in each phase via `AGENTS.md`.

---

## Comparison

### Atreides vs. other AI orchestration tools?

Atreides is specifically designed for OpenCode and focuses on:
- Developer workflow (not general AI tasks)
- Security-first design
- Minimal configuration
- Transparent operation (AGENTS.md is readable)

### Should I use Atreides for every project?

Atreides is most valuable for:
- Complex projects with multiple components
- Teams wanting consistent AI behavior
- Projects requiring security controls
- Long-running development with context preservation

For simple, one-off tasks, plain OpenCode may be sufficient.
