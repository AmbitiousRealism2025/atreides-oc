# Atreides OpenCode — Production Security Code Review (TypeScript/Bun)

## Executive Summary

Atreides includes serious, thoughtfully designed defenses around **tool execution security** (command/file pattern blocking, obfuscation normalization, and PII/secret redaction for logs). Those are strong foundations and show clear security intent.

The highest-risk gaps are in the **CLI + local file operations**, especially around **path handling**. Several functions accept IDs/paths (e.g., `checkpointId`, `sessionId`, "relative" paths) and then `join()` them into filesystem paths without enforcing "stay within this directory" constraints. In multiple places this can lead to **path traversal**, and in one case could lead to **destructive deletion** if invoked with malicious/accidental arguments.

---

## Critical Issues

### 1) Arbitrary directory deletion via unvalidated `checkpointId` (path traversal / absolute path injection)
**Where**
- `src/lib/checkpoint-manager.ts:249` (checkpoint path construction)
- `src/lib/checkpoint-manager.ts:552` (deletion)
- Triggerable via CLI: `src/cli/checkpoint.ts:260` (checkpoint delete action)

**Why it's critical**
`checkpointId` is treated as a directory name, but it is not validated. `join(base, userValue)` allows:
- `checkpointId = "/etc"` → resolves to `/etc` (absolute path wins)
- `checkpointId = "../../somewhere"` → escapes `CHECKPOINTS_DIR`

Then deletion uses `rm(..., { recursive: true, force: true })`, which can erase arbitrary directories that the current user can delete.

**Evidence (snippets)**

`src/lib/checkpoint-manager.ts:249`
```ts
function getCheckpointPath(checkpointId: string): string {
  return join(CHECKPOINTS_DIR, checkpointId);
}
```

`src/lib/checkpoint-manager.ts:552`
```ts
export async function deleteCheckpoint(checkpointId: string): Promise<boolean> {
  const checkpointDir = getCheckpointPath(checkpointId);
  await rm(checkpointDir, { recursive: true, force: true });
  ...
}
```

**Impact**
- Local destructive data loss if user passes an unexpected value (accidental or malicious copy/paste).
- If this CLI is ever exposed indirectly (scripts, wrappers), this becomes a serious foot-gun.

---

### 2) Arbitrary file write / overwrite via malicious checkpoint manifest contents (restore path traversal)
**Where**
- `src/lib/checkpoint-manager.ts:488` and `src/lib/checkpoint-manager.ts:509` (restore write target)
- Triggerable via CLI: `src/cli/restore.ts:250`

**Why it's critical**
`restoreCheckpoint()` trusts `file.relativePath` from a JSON manifest and does:
- `destPath = join(restorePath, file.relativePath)`
If `file.relativePath` contains `../` segments or is absolute, `join()` can escape `restorePath` and overwrite arbitrary files.

**Evidence (snippets)**

`src/lib/checkpoint-manager.ts:488`
```ts
const sourcePath = join(filesDir, file.relativePath);
const destPath = join(restorePath, file.relativePath);
```

`src/lib/checkpoint-manager.ts:509`
```ts
await copyFile(sourcePath, destPath);
```

**Impact**
- A crafted checkpoint under `~/.atreides/checkpoints/...` could overwrite sensitive files when restored (e.g., shell rc files, project files outside target, etc.).
- Even if the checkpoint directory is "local-only", in practice users can be convinced to "restore this checkpoint id" or copy checkpoint directories around.

---

## High Severity Issues

### 3) Path traversal via `sessionId` in persisted state/log paths
**Where**
- `src/lib/state-persistence.ts:167`
- `src/lib/session-logger.ts:74` (log path builder)
- SessionId validation is extremely weak: `src/plugin/utils.ts:105`

**Why**
`sessionId` is taken from OpenCode hook payloads and is only checked as non-empty string (`isValidSessionId`). It is then used in file names:

`src/lib/state-persistence.ts:167`
```ts
getStatePath(sessionId: string): string {
  return join(STATE_DIR, `${sessionId}.json`);
}
```

If `sessionId` can include `/`, `..`, or be absolute-like, it can escape the intended directory and write/overwrite other files. Even if OpenCode *currently* emits safe IDs, this is brittle and should be defensive at boundaries.

**Impact**
- Unexpected file writes outside `~/.atreides/state` (and similarly `~/.atreides/logs`) if session IDs are ever attacker-influenced or malformed.

---

### 4) `FileManager` allows escaping `basePath` via absolute paths or `..`
**Where**
- `src/lib/file-manager.ts:9`, `src/lib/file-manager.ts:17`, `src/lib/file-manager.ts:27`

**Evidence**
`join(this.basePath, relativePath)` is used directly:

`src/lib/file-manager.ts:16`
```ts
async read(relativePath: string): Promise<string> {
  return readFile(join(this.basePath, relativePath), "utf-8");
}
```

If `relativePath` is actually absolute (`/etc/passwd`) or contains traversal (`../../..`), `join()` will escape `basePath`.

**Impact**
- Today this is used primarily by generators (`src/generators/agent-generator.ts`, `src/generators/skill-generator.ts`), but since `FileManager` is exported (`src/lib/index.ts:3`), it's a reusable primitive that could become a latent vulnerability as usage expands.

---

## Medium Severity Issues

### 5) Potential secret leakage in security-hardening obfuscation logging
**Where**
- `src/plugin/managers/security-hardening.ts:405`

**Why**
When obfuscation is detected, the logger records:
- `original: command.substring(0, 100)`
- `normalized: normalized.substring(0, 100)`

This bypasses the otherwise-good `sanitizeCommandForLogging()` redaction flow.

**Evidence**
`src/plugin/managers/security-hardening.ts:405`
```ts
logger.warn("Potential obfuscation detected in command", {
  original: command.substring(0, 100),
  normalized: normalized.substring(0, 100),
});
```

**Impact**
- If a command contains tokens/secrets (common with `curl`, env assignments, etc.), the first 100 chars can still leak credentials into logs.

---

### 6) Shell execution via interpolated strings (low exploitability today, risky pattern)
**Where**
- `src/cli/doctor.ts:952` (execSync)
- `src/lib/version.ts:35` / `src/lib/version.ts:111` (exec)

**Evidence**
`src/cli/doctor.ts:952`
```ts
execSync(`${command} ${args.join(" ")}`, { ... });
```

**Impact**
- Currently `command`/`args` are hardcoded (`opencode`, `bun`, `node`), so practical risk is low.
- But it normalizes a "string shell command" pattern that becomes dangerous if later refactored to accept user input.

---

### 7) File permissions not explicitly restricted for persisted logs/state
**Where**
- `src/lib/session-logger.ts:262` (mkdir without mode)
- `src/lib/state-persistence.ts:155` (mkdir without mode)
- Multiple `writeFile`/`appendFile` calls without mode

**Why**
Even with PII filtering, logs/state can contain sensitive operational details. On multi-user systems, default directory perms may be more permissive than desired (depends on umask). Security posture is stronger if `~/.atreides` directories are `0700` and files `0600`.

---

## Low Severity Issues

### 8) Naive YAML frontmatter parsing (Doctor command)
**Where**
- `src/cli/doctor.ts:969`

This is intentionally "simple YAML parsing" and only used for validation, not execution. Main risks are correctness/false positives rather than security.

---

## Security Best Practices Observed

- Strong **command normalization + obfuscation detection pipeline** before applying deny/ask/allow (`src/plugin/managers/security-hardening.ts`).
- Explicit blocks for dangerous commands (e.g., `rm -rf /`, `curl | bash`) and sensitive file patterns (`.env`, keys, credentials).
- **Fail-closed behavior** on validation errors (`validateCommand`, `validateFilePath` deny on exception).
- Structured session logging with **PII filtering**, including secrets and JWT patterns (`src/lib/session-logger.ts`).
- Atomic-ish state writes using temp file then rename (`src/lib/state-persistence.ts:280`).

---

## Recommendations

1) **Enforce strict ID validation** for `checkpointId`:
   - Allow only expected format like `^chk_[0-9]{14}_[a-z0-9]{4}$` (or at least `^chk_[A-Za-z0-9_-]+$`)
   - Reject any value containing `/`, `\`, `..`, or starting with `/`
   - Apply in `getCheckpointPath`, and in CLI argument parsing for `checkpoint`/`restore`

2) **Enforce "stay within base directory" on restore paths**:
   - Normalize and resolve: `resolved = resolve(base, relative)`
   - Verify: `resolved.startsWith(baseResolved + sep)`
   - Reject absolute paths / traversal sequences in `file.relativePath`

3) **Harden `sessionId`** before using in filenames:
   - Replace `isValidSessionId()` (`src/plugin/utils.ts:105`) with a strict allowlist (e.g., `[A-Za-z0-9_-]{1,128}`)
   - Consider mapping session IDs to safe filenames via hashing if you need to preserve arbitrary IDs

4) **Fix `FileManager` to enforce basePath containment**:
   - Either validate "relativePath must be relative" + no traversal
   - Or implement safe resolve+prefix checks before any filesystem op

5) **Sanitize security-hardening logs consistently**:
   - Use `sanitizeCommandForLogging()` for *all* logs that include command content (including obfuscation warnings)

6) **Prefer `execFile`/`spawn` argument arrays over `exec` string commands** going forward, even if today's calls are safe.

**Estimated effort**: **Medium (1–2 days)** for a full fix (input validation + safe path helpers + tests), because these changes touch multiple core utilities and should be covered by tests to avoid regressions.

---

*Review completed: Security Code Review*
*Reviewer: Oracle Agent*
