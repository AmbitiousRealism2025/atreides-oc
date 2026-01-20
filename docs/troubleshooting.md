# Troubleshooting Guide

Solutions for common issues with Atreides OpenCode.

## Quick Diagnosis

Run the doctor command first:

```bash
npx atreides-opencode doctor --verbose
```

This identifies most issues and suggests fixes.

---

## Installation Issues

### Plugin Not Loading

**Symptom**: OpenCode doesn't recognize the Atreides plugin.

**Diagnosis**:
```bash
npx atreides-opencode doctor --check plugin
```

**Solutions**:

1. **Verify plugin file exists**
   ```bash
   ls -la .opencode/plugin/atreides.ts
   ```
   If missing, regenerate:
   ```bash
   npx atreides-opencode init --mode standard
   ```

2. **Check opencode.json plugin reference**
   ```json
   {
     "plugins": ["./opencode/plugin/atreides.ts"]
   }
   ```

3. **Verify OpenCode version**
   ```bash
   opencode --version
   ```
   Ensure you're running a version with plugin support.

4. **Restart OpenCode**
   Close and reopen OpenCode to reload plugins.

---

### AGENTS.md Not Applied

**Symptom**: Orchestration rules not working, AI not following workflow.

**Diagnosis**:
```bash
npx atreides-opencode doctor --check config
```

**Solutions**:

1. **Verify file location**
   `AGENTS.md` must be in the project root directory.
   ```bash
   ls -la AGENTS.md
   ```

2. **Check markdown syntax**
   Invalid markdown can cause parsing failures:
   ```bash
   npx atreides-opencode doctor --verbose
   ```

3. **Look for syntax errors**
   - Unclosed code blocks
   - Invalid YAML frontmatter
   - Broken markdown tables

4. **Restart OpenCode session**
   Start a new chat session after fixing issues.

---

### Init Wizard Fails

**Symptom**: `init` command crashes or hangs.

**Solutions**:

1. **Check Node.js version**
   ```bash
   node --version
   # Must be >= 20.0.0
   ```

2. **Check write permissions**
   ```bash
   touch test-file && rm test-file
   ```
   If this fails, you don't have write access.

3. **Run with debug logging**
   ```bash
   ATREIDES_DEBUG=true npx atreides-opencode init
   ```

4. **Try non-interactive mode**
   ```bash
   npx atreides-opencode init --yes
   ```

---

## Configuration Issues

### Invalid opencode.json

**Symptom**: Error messages about configuration, plugin doesn't load.

**Diagnosis**:
```bash
npx atreides-opencode doctor --check config
```

**Solutions**:

1. **Validate JSON syntax**
   ```bash
   # Check for JSON errors
   node -e "require('./opencode.json')"
   ```

2. **Check schema compliance**
   Common issues:
   - Missing required fields
   - Wrong data types
   - Invalid enum values

3. **Regenerate configuration**
   ```bash
   # Backup existing
   cp opencode.json opencode.json.backup

   # Regenerate
   npx atreides-opencode init
   ```

---

### Agent Model Not Available

**Symptom**: Agent fails to delegate, model errors.

**Solutions**:

1. **Check available models in OpenCode**
   Verify your OpenCode instance has access to the configured model.

2. **Update agent configuration**
   Edit `.opencode/agent/{agent}.md`:
   ```markdown
   ---
   name: stilgar
   model: claude-sonnet-4  # Change to available model
   ---
   ```

3. **Use doctor to identify model issues**
   ```bash
   npx atreides-opencode doctor --check agents
   ```

---

### Permission Denied Errors

**Symptom**: Commands blocked unexpectedly.

**Solutions**:

1. **Check permission configuration**
   In `opencode.json`:
   ```json
   {
     "atreides": {
       "permissions": {
         "bash": {
           "allow": ["npm *", "npx *"]
         }
       }
     }
   }
   ```

2. **Review security settings**
   ```bash
   npx atreides-opencode doctor --check security
   ```

3. **Add command to allow list**
   ```json
   {
     "atreides": {
       "permissions": {
         "bash": {
           "allow": ["npm *", "your-command *"]
         }
       }
     }
   }
   ```

---

## Runtime Issues

### Workflow Not Progressing

**Symptom**: AI stuck in one phase, not advancing through workflow.

**Solutions**:

1. **Check workflow configuration**
   In `opencode.json`:
   ```json
   {
     "atreides": {
       "workflow": {
         "enabled": true,
         "autoAdvance": true
       }
     }
   }
   ```

2. **Verify AGENTS.md workflow section**
   Ensure workflow phases are properly defined.

3. **Restart session**
   Start a new chat to reset workflow state.

---

### Error Recovery Not Working

**Symptom**: AI keeps retrying failed commands without escalating.

**Solutions**:

1. **Check error recovery configuration**
   ```json
   {
     "atreides": {
       "errorRecovery": {
         "enabled": true,
         "maxStrikes": 3,
         "escalationThreshold": 3
       }
     }
   }
   ```

2. **Verify strike count isn't reset**
   Strikes may reset between sessions.

3. **Check for silent errors**
   Enable debug logging:
   ```bash
   ATREIDES_DEBUG=true opencode
   ```

---

### Todo Enforcement Too Strict

**Symptom**: AI creates todos for simple tasks.

**Solutions**:

1. **Adjust minimum steps threshold**
   ```json
   {
     "atreides": {
       "todoEnforcement": {
         "minStepsForList": 5  // Increase from default 3
       }
     }
   }
   ```

2. **Disable todo enforcement**
   ```json
   {
     "atreides": {
       "todoEnforcement": {
         "enabled": false
       }
     }
   }
   ```

---

### Agent Delegation Failing

**Symptom**: AI doesn't delegate or delegation errors.

**Solutions**:

1. **Check agent is enabled**
   ```json
   {
     "atreides": {
       "agents": {
         "explore": {
           "enabled": true
         }
       }
     }
   }
   ```

2. **Verify agent file exists**
   ```bash
   ls -la .opencode/agent/explore.md
   ```

3. **Check agent file syntax**
   ```bash
   npx atreides-opencode doctor --check agents
   ```

4. **Regenerate agent files**
   ```bash
   npx atreides-opencode init
   ```

---

## Security Issues

### False Positive Command Blocking

**Symptom**: Safe commands blocked as dangerous.

**Solutions**:

1. **Check blocked patterns**
   Default blocked patterns might be too aggressive.

2. **Add to allow list**
   ```json
   {
     "atreides": {
       "permissions": {
         "bash": {
           "allow": ["your-safe-command *"]
         }
       }
     }
   }
   ```

3. **Disable specific security features** (not recommended)
   ```json
   {
     "atreides": {
       "security": {
         "blockedPatterns": false
       }
     }
   }
   ```

---

### Obfuscation False Positives

**Symptom**: Legitimate commands flagged as obfuscated.

**Solutions**:

1. **Review the command**
   Obfuscation detection catches:
   - URL-encoded characters
   - Hex-encoded strings
   - Quote-stripped commands

2. **Use plain command format**
   Instead of: `npm%20install`
   Use: `npm install`

3. **Adjust detection sensitivity** (advanced)
   Contact maintainers for custom pattern configuration.

---

## Update Issues

### Update Loses Customizations

**Symptom**: Custom rules or settings missing after update.

**Solutions**:

1. **Check backup directory**
   ```bash
   ls -la .opencode/.backup-*/
   ```

2. **Restore from backup**
   ```bash
   cp .opencode/.backup-2026-01-19/AGENTS.md ./AGENTS.md
   ```

3. **Merge manually**
   Compare backup with current files and merge customizations.

---

### Update Fails Midway

**Symptom**: Update interrupted, inconsistent state.

**Solutions**:

1. **Restore from backup**
   ```bash
   cp -r .opencode/.backup-*/* ./
   ```

2. **Clean and reinitialize**
   ```bash
   rm -rf .opencode/ AGENTS.md
   npx atreides-opencode init
   ```

3. **Force reinstall**
   ```bash
   npx atreides-opencode update --force
   ```

---

## Getting Help

### Debug Logging

Enable detailed logging:

```bash
ATREIDES_DEBUG=true npx atreides-opencode doctor
```

### Reporting Issues

When reporting issues, include:

1. **Doctor output**
   ```bash
   npx atreides-opencode doctor --json > doctor-output.json
   ```

2. **Version information**
   ```bash
   npx atreides-opencode version
   node --version
   ```

3. **Relevant configuration** (sanitize secrets)

4. **Steps to reproduce**

### Support Channels

- **GitHub Issues**: https://github.com/atreides/atreides-opencode/issues
- **Documentation**: https://atreides-opencode.dev/docs

---

## Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `Plugin not found` | Missing plugin file | Run `init` to regenerate |
| `Invalid configuration` | JSON syntax error | Validate and fix `opencode.json` |
| `Model not available` | Unsupported model | Update agent model configuration |
| `Permission denied` | Command blocked | Add to allow list |
| `AGENTS.md parse error` | Markdown syntax | Fix markdown syntax |
| `Strike limit exceeded` | Too many failures | Check underlying error, fix issue |
| `Agent not found` | Missing agent file | Regenerate agent files |
