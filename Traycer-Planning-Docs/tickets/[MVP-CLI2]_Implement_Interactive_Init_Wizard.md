# [MVP-CLI2] Implement Interactive Init Wizard

## Objective

Implement the interactive onboarding wizard that guides users through Atreides setup.

## Context

The init wizard is the primary onboarding experience. It must be intuitive, provide clear guidance, and generate correct configurations.

**References**:
- Core Flows: spec:bf063507-9358-4515-afbb-3080f2099467/f32d7c5a-99f4-4e9f-99f3-c04d552db8c7 (Flow 2)
- Technical Plan: spec:bf063507-9358-4515-afbb-3080f2099467/5cdb5788-a716-4cb2-a301-6ccd6f64a488 (Section 3.2.1)
- Master Plan: file:ATREIDES_OC_MASTER_PLAN.md (Section 9.1)

## Scope

**In Scope**:
- 5-step wizard flow (detection, mode, models, permissions, confirmation)
- Interactive prompts with keyboard navigation
- Project type confirmation
- Installation mode selection (minimal/standard/full)
- Model configuration per agent (8 agents)
- Permission configuration by category
- Configuration summary and confirmation
- Detailed post-wizard summary
- Re-initialization handling (merge mode)

**Out of Scope**:
- File generation (separate ticket)
- Template processing (separate ticket)
- Doctor command integration (separate ticket)

## Implementation Guidance

### Wizard Framework

**src/cli/wizard/index.ts**:
- Use interactive prompt library (inquirer, prompts, or similar)
- Implement 5-step flow from Core Flows
- Forward-only navigation (no back button)
- Clear progress indication (Step 1/5, 2/5, etc.)
- Ctrl+C to cancel and restart

### Step 1: Project Detection & Confirmation

**Implementation**:
- Call `detectProjectType()` from project-detection
- Display detection result with evidence
- Ask for confirmation: "Is this correct? [Y/n]"
- If no: Show manual selection menu
- If detection fails: Default to Generic with disclosure

### Step 2: Installation Mode Selection

**Implementation**:
- Show three modes with descriptions:
  - Minimal: AGENTS.md only
  - Standard: Full config, no delegation (default)
  - Full: Everything including delegation
- Use radio button selection
- Show what files each mode creates
- Default: Standard

### Step 3: Model Configuration

**Implementation**:
- List all 8 agents (5 MVP + 3 post-MVP)
- For each agent show:
  - Name and display name
  - Purpose/description
  - Recommended model with performance note
  - Dropdown to change model
- Tab/Shift+Tab navigation
- Enter to change model
- Ctrl+D when done
- Model options: Show common models with performance recommendations

**Agent List**:
1. Stilgar (Oracle) - Architecture decisions - Recommended: claude-sonnet-4
2. Explore - Fast codebase exploration - Recommended: claude-haiku-4-5
3. Librarian - Documentation research - Recommended: claude-haiku-4-5
4. Build - Default full-access - Recommended: claude-sonnet-4
5. Plan - Read-only planning - Recommended: claude-sonnet-4
6. Frontend-UI-UX - Visual/styling - Recommended: claude-sonnet-4
7. Document-Writer - Documentation - Recommended: claude-sonnet-4
8. General - Multi-purpose - Recommended: claude-sonnet-4

### Step 4: Permission Configuration

**Implementation**:
- Show permission categories with checkboxes:
  - File Operations (read, write, edit, delete)
  - Shell Commands (language-specific + system)
  - Network Access (HTTP/HTTPS, unrestricted)
  - Git Operations (read-only, commit, push, force)
- Pre-select based on detected project type
- Space to toggle, Enter to continue
- Map UI categories to OpenCode permission schema

**Permission Mapping**:
- File Operations → `read`, `edit` permissions
- Shell Commands → `bash` permission with patterns
- Network Access → `webfetch`, `websearch` permissions
- Git Operations → `bash` with git-specific patterns

### Step 5: Confirmation & Summary

**Implementation**:
- Show complete configuration summary
- List all files to be created
- Ask for final confirmation: "Proceed? [Y/n]"
- If yes: Proceed to file generation
- If no: Cancel (no files created)

### Post-Wizard Summary

**Implementation**:
- Show detailed success message
- List created files with descriptions
- Show configuration summary
- Provide next steps (review AGENTS.md, run doctor, start using)
- Include documentation and support links

### Re-initialization Handling

**Implementation**:
- Detect existing `.opencode/` or `AGENTS.md`
- Show merge mode message
- Explain what will be preserved
- Create backup before proceeding
- Proceed with merge (handled by update logic)

## Acceptance Criteria

- [ ] Wizard implements 5-step flow from Core Flows
- [ ] Step 1: Project detection with confirmation
- [ ] Step 2: Mode selection with descriptions
- [ ] Step 3: Model configuration for all 8 agents
- [ ] Step 4: Permission configuration by category
- [ ] Step 5: Summary and confirmation
- [ ] Post-wizard: Detailed summary with next steps
- [ ] Re-initialization: Merge mode with backup
- [ ] Forward-only navigation (Ctrl+C to restart)
- [ ] Keyboard-driven interface (arrows, Enter, Space, Tab)
- [ ] Clear error messages for invalid input
- [ ] Progress indication (step numbers)
- [ ] Unit tests: Each wizard step logic
- [ ] Integration test: Complete wizard flow
- [ ] E2E test: Full init process

## Dependencies

**Depends On**:
- [MVP-CLI1] Implement CLI Framework & Project Detection

**Blocks**:
- [MVP-CLI4] Implement File Generation System

## Estimated Effort

**16 hours** (8h wizard flow + 4h prompts + 4h testing)

## Testing

**Unit Tests**:
- Project detection confirmation logic
- Mode selection validation
- Model configuration collection
- Permission mapping to OpenCode schema
- Summary generation

**Integration Tests**:
- Complete wizard flow (all steps)
- Re-initialization detection
- Ctrl+C cancellation
- Invalid input handling

**E2E Tests**:
- Full init in test project
- Verify all prompts appear
- Verify configuration collected correctly