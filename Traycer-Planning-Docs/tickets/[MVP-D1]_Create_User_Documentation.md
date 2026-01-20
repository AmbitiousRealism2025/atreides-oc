# [MVP-D1] Create User Documentation

## Context

Create comprehensive user-facing documentation including README, installation guide, configuration guide, and troubleshooting. This is the primary resource for users getting started with Atreides OpenCode.

**References**:
- Component Spec: spec:bf063507-9358-4515-afbb-3080f2099467/9ed0f511-54fb-4b20-99cd-f418b041bb80
- Core Flows: spec:bf063507-9358-4515-afbb-3080f2099467/f32d7c5a-99f4-4e9f-99f3-c04d552db8c7

**Dependencies**: All MVP tickets (documentation reflects implemented features)

---

## Scope

### In Scope
- README.md (root of npm package)
- Installation guide
- Quick start guide
- Configuration guide (opencode.json, AGENTS.md)
- CLI reference (init, doctor, update)
- Troubleshooting guide
- FAQ
- Examples

### Out of Scope
- Developer documentation (separate ticket)
- API reference (separate ticket)
- Video tutorials
- Interactive demos

---

## Implementation Guidance

### README.md Structure

```markdown
# Atreides OpenCode

AI orchestration plugin for OpenCode providing structured workflows, agent delegation, error recovery, and security hardening.

## Features

- 🎯 **Structured Workflows**: 5-phase workflow (Intent → Assessment → Exploration → Implementation → Verification)
- 🤖 **Agent Delegation**: 5 specialized agents (Stilgar, Explore, Librarian, Build, Plan)
- 🛡️ **Security Hardening**: Multi-layer command validation and obfuscation detection
- 🔄 **Error Recovery**: 3-strike protocol with automatic escalation
- ✅ **Todo Enforcement**: Track and enforce task completion

## Quick Start

\`\`\`bash
# Install via npx (recommended)
npx atreides-opencode init

# Or install globally
npm install -g atreides-opencode
atreides-opencode init
\`\`\`

## Installation

[Detailed installation steps]

## Configuration

[Configuration guide]

## CLI Commands

[CLI reference]

## Troubleshooting

[Common issues and solutions]

## License

MIT
```

### Configuration Guide

```markdown
# Configuration Guide

## opencode.json

Atreides configuration lives under the `atreides` key:

\`\`\`json
{
  "atreides": {
    "identity": {
      "personaName": "Muad'Dib",
      "responsePrefix": true,
      "delegationAnnouncements": true
    },
    "agents": {
      "stilgar": {
        "model": "claude-sonnet-4",
        "enabled": true
      }
    },
    "skills": {
      "orchestrate": { "enabled": true }
    }
  }
}
\`\`\`

## AGENTS.md

[AGENTS.md format and customization]

## Agent Configuration

[Per-agent configuration]

## Skill Configuration

[Per-skill configuration]
```

### Troubleshooting Guide

```markdown
# Troubleshooting

## Plugin Not Loading

**Symptom**: OpenCode doesn't recognize Atreides plugin

**Solutions**:
1. Run `atreides-opencode doctor` to diagnose
2. Verify `opencode.json` has plugin reference
3. Check OpenCode version compatibility
4. Restart OpenCode

## AGENTS.md Not Applied

**Symptom**: Orchestration rules not working

**Solutions**:
1. Run `atreides-opencode doctor` to validate syntax
2. Check file location (must be in project root)
3. Verify markdown syntax
4. Restart OpenCode session

[More troubleshooting scenarios]
```

---

## Acceptance Criteria

### Functional
- [ ] README.md created
- [ ] Installation guide complete
- [ ] Configuration guide complete
- [ ] CLI reference complete
- [ ] Troubleshooting guide complete
- [ ] FAQ created
- [ ] Examples provided

### Quality
- [ ] Clear and concise writing
- [ ] Code examples tested
- [ ] Screenshots/diagrams where helpful
- [ ] Links working
- [ ] Consistent formatting

### Documentation
- [ ] All user-facing features documented
- [ ] Common workflows covered
- [ ] Error messages explained

---

## Effort Estimate

**From Master Plan**: 2 days (Week 6)