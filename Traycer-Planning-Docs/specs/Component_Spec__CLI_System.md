# Component Spec: CLI System

## Overview

This spec covers the CLI system for Atreides OpenCode: init wizard, doctor diagnostics, and update command.

**References**:
- Core Flows: spec:bf063507-9358-4515-afbb-3080f2099467/f32d7c5a-99f4-4e9f-99f3-c04d552db8c7
- Technical Plan: spec:bf063507-9358-4515-afbb-3080f2099467/5cdb5788-a716-4cb2-a301-6ccd6f64a488 (Section 3.2)
- Master Plan: file:ATREIDES_OC_MASTER_PLAN.md (Section 9)

**Scope**: MVP Phase 1-3 (Weeks 2, 6)

---

## CLI Commands

### init Command

**Purpose**: Interactive onboarding wizard for project setup

**Flow**: See Core Flows spec, Flow 2

**Steps**:
1. Check OpenCode installation
2. Detect project type
3. Select installation mode (minimal/standard/full)
4. Configure models per agent
5. Configure permissions by category
6. Confirm and generate files

**Output**: Complete Atreides setup with all files generated

### doctor Command

**Purpose**: Verify installation and diagnose issues

**Flow**: See Core Flows spec, Flow 3

**Checks**:
- OpenCode installation
- Plugin loading
- Agent files validity
- Skill files validity
- Configuration syntax
- Security patterns

**Output**: Traffic light summary (green/yellow/red) + detailed breakdown

### update Command

**Purpose**: Update to latest version while preserving customizations

**Flow**: See Core Flows spec, Flow 4

**Steps**:
1. Check npm for latest version
2. Update npm package
3. Load customization manifest
4. Structural merge with conflict resolution
5. Update manifest
6. Show summary

**Output**: Updated installation with customizations preserved

---

## Acceptance Criteria

- ✅ All three commands implemented and functional
- ✅ Commands follow Core Flows specifications
- ✅ Error handling for all edge cases
- ✅ Clear, actionable output messages
- ✅ Comprehensive testing for each command