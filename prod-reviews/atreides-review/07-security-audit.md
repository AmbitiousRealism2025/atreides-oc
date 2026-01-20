# Atreides-OpenCode Security Audit Report

**Audit Date:** 2026-01-19
**Auditor:** Security Engineer (Claude Opus 4.5)
**Codebase Version:** 0.1.0
**Scope:** Full codebase security review with focus on security-critical modules

---

## Executive Summary

### Overall Security Rating: **B+**

The Atreides-OpenCode plugin demonstrates **strong security fundamentals** with a well-designed multi-layer security architecture. The codebase implements comprehensive command validation, obfuscation detection, and PII filtering capabilities that exceed typical plugin security measures.

**Key Strengths:**
- Robust 5-stage obfuscation detection pipeline
- Comprehensive blocked command patterns (22+ patterns)
- Well-implemented path traversal protection
- Strong PII filtering for logs and persisted state
- Fail-closed error handling throughout

**Areas for Improvement:**
- Minor input validation gaps in CLI commands
- Potential regex denial-of-service vectors
- Missing rate limiting on some operations
- Some file operations lack symlink protection

---

## Vulnerability Findings

### CRITICAL Severity

*No critical vulnerabilities identified.*

---

### HIGH Severity

#### H-1: Command Injection via Editor Environment Variable

**Location:** `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/cli/conflict-resolution.ts:90-93`

**Description:** The conflict resolution module spawns an external editor using environment variables without sanitization.

```typescript
// Line 90
const editorCmd = process.env.EDITOR || process.env.VISUAL || "vi";

// Line 93
const child = spawn(editorCmd, [filePath], {
  stdio: "inherit",
});
```

**Risk:** If an attacker can control the `EDITOR` or `VISUAL` environment variables (e.g., through a malicious `.bashrc` or environment file), they could execute arbitrary commands with the user's privileges.

**OWASP Category:** A03:2021 - Injection

**Remediation:**
1. Validate the editor command against an allowlist of known safe editors
2. Use `which` or `command -v` to verify the editor exists as an executable
3. Consider providing a fixed list of supported editors via configuration

**Priority:** High

---

#### H-2: execSync Usage with Potential Command Injection Vector

**Location:** `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/cli/doctor.ts:952`

**Description:** The doctor command uses `execSync` to check command versions.

```typescript
// Line 952
const result = execSync(`${command} ${args.join(" ")}`, {
  encoding: "utf-8",
  timeout: 5000,
  stdio: ["pipe", "pipe", "pipe"],
});
```

**Risk:** While `command` and `args` are internally controlled in this instance, the pattern is dangerous. If any future code paths pass unsanitized input to this function, it would create a command injection vulnerability.

**OWASP Category:** A03:2021 - Injection

**Remediation:**
1. Use `execFile` or `spawnSync` instead of `execSync` to avoid shell interpretation
2. Pass arguments as an array rather than string concatenation
3. Add explicit validation for command names against an allowlist

**Priority:** High

---

### MEDIUM Severity

#### M-1: Regular Expression Denial of Service (ReDoS) Risk

**Location:** `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/plugin/managers/security-hardening.ts:33-85`

**Description:** Several regex patterns in `BLOCKED_COMMAND_PATTERNS` contain nested quantifiers that could be exploited for ReDoS attacks.

```typescript
// Line 35 - Nested quantifiers
/rm\s+(-[a-zA-Z]*)?r[a-zA-Z]*\s+(-[a-zA-Z]*\s+)*\/($|\s|;)/i

// Line 50 - Potential backtracking
/curl\s+.*\|\s*(ba)?sh/i
```

**Risk:** A maliciously crafted command string could cause excessive CPU consumption during regex evaluation, leading to denial of service.

**OWASP Category:** A03:2021 - Injection (Regex Injection)

**Remediation:**
1. Add input length limits before regex evaluation (already partially done with 500 char limit in logs)
2. Consider using atomic groups or possessive quantifiers where supported
3. Add timeout protection around regex operations
4. Pre-filter input to reject obviously malicious lengths

**Priority:** Medium

---

#### M-2: Missing Symlink Attack Protection in File Operations

**Location:** `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/lib/file-manager.ts:16-24`

**Description:** File read/write operations do not check for symlinks that could lead to accessing files outside the intended directory.

```typescript
// Line 16-24
async read(relativePath: string): Promise<string> {
  return readFile(join(this.basePath, relativePath), "utf-8");
}

async write(relativePath: string, content: string): Promise<void> {
  const fullPath = join(this.basePath, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, "utf-8");
}
```

**Risk:** An attacker could create a symlink within the project directory pointing to sensitive system files. When the application reads or writes through this symlink, it could access or modify files outside the intended scope.

**OWASP Category:** A01:2021 - Broken Access Control

**Remediation:**
1. Use `fs.lstat` to check if the target is a symlink before operations
2. Resolve the real path with `fs.realpath` and verify it's within the allowed directory
3. Add a configuration option to optionally allow symlinks with explicit user consent

**Priority:** Medium

---

#### M-3: Race Condition in Atomic Write (TOCTOU)

**Location:** `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/lib/state-persistence.ts:283-291`

**Description:** The "atomic" write implementation has a potential race condition.

```typescript
// Lines 283-291
// Write to temp file first (atomic write)
await writeFile(tempPath, content, "utf-8");

// Rename temp file to actual file
await rename(tempPath, statePath);
```

**Risk:** While `rename` is generally atomic on POSIX systems, there's a window between write completion and rename where the temp file could be accessed or modified by another process.

**OWASP Category:** A04:2021 - Insecure Design

**Remediation:**
1. Set restrictive permissions on the temp file immediately after creation (mode 0600)
2. Use a unique temp file name with secure random suffix
3. Consider using `fs.writeFile` with `{ flag: 'wx' }` for exclusive creation
4. Verify the temp file location is in a secure directory

**Priority:** Medium

---

#### M-4: Potential Information Disclosure in Error Messages

**Location:** `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/plugin/handlers.ts:448`

**Description:** Security block messages include the matched pattern, which could help attackers understand the security rules.

```typescript
// Line 448
return createToolBeforeResult(
  false,
  `[SECURITY] ${validationResult.reason}. Pattern: ${validationResult.matchedPattern}`
);
```

**Risk:** Exposing the exact regex pattern that triggered a block helps attackers craft bypass attempts.

**OWASP Category:** A05:2021 - Security Misconfiguration

**Remediation:**
1. Remove pattern details from user-facing error messages
2. Log the full details (including pattern) only to internal audit logs
3. Provide generic error messages to users while maintaining detailed internal logging

**Priority:** Medium

---

#### M-5: Insufficient JSON.parse Error Handling

**Location:** Multiple files (see list below)

**Files affected:**
- `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/lib/config.ts:588`
- `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/lib/checkpoint-manager.ts:404,434`
- `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/lib/session-logger.ts:420`

**Description:** Multiple JSON.parse calls could throw errors on malformed input, and while most are wrapped in try-catch, some error handling could be more robust.

```typescript
// config.ts:588
const parsed = JSON.parse(content) as { atreides?: Partial<Config> };
```

**Risk:** Malformed JSON files could cause application crashes or expose internal error details.

**OWASP Category:** A10:2021 - Server-Side Request Forgery (related: improper input validation)

**Remediation:**
1. Ensure all JSON.parse calls are wrapped in try-catch with appropriate error handling
2. Validate the structure of parsed JSON before using it
3. Consider using a schema validation library for critical configuration files

**Priority:** Medium

---

### LOW Severity

#### L-1: Incomplete Unicode Homoglyph Coverage

**Location:** `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/plugin/managers/security-hardening.ts:321-335`

**Description:** The Unicode normalization function covers only 13 Cyrillic homoglyphs, missing many other confusable characters.

```typescript
// Lines 321-335
const homoglyphs: Record<string, string> = {
  "\u0430": "a", // Cyrillic a
  "\u0435": "e", // Cyrillic e
  // ... only 13 characters covered
};
```

**Risk:** Attackers could use Greek, Armenian, or other Unicode homoglyphs not covered by the current implementation to bypass security filters.

**OWASP Category:** A03:2021 - Injection

**Remediation:**
1. Use a comprehensive Unicode confusables database from Unicode.org
2. Consider normalizing using NFKC normalization before pattern matching
3. Add tests for additional homoglyph attacks

**Priority:** Low

---

#### L-2: Missing Rate Limiting on Validation Operations

**Location:** `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/plugin/managers/security-hardening.ts:396-462`

**Description:** The `validateCommand` function performs complex regex operations without any rate limiting.

**Risk:** A flood of validation requests with complex inputs could consume significant CPU resources.

**OWASP Category:** A06:2021 - Vulnerable and Outdated Components (related: resource exhaustion)

**Remediation:**
1. Implement per-session rate limiting for validation calls
2. Add input size limits before validation processing
3. Consider caching negative results to prevent repeated validation of the same malicious input

**Priority:** Low

---

#### L-3: Log Injection Partially Mitigated

**Location:** `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/plugin/managers/security-hardening.ts:627-642`

**Description:** The `sanitizeLogOutput` function removes control characters but may not prevent all log injection attacks.

```typescript
// Lines 630-634
let sanitized = output.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
```

**Risk:** Some log forging attacks using specific character sequences may still be possible.

**OWASP Category:** A09:2021 - Security Logging and Monitoring Failures

**Remediation:**
1. Consider encoding output for specific log formats (e.g., JSON escaping for structured logs)
2. Add validation for log message structure in JSONL format
3. Test with known log injection payloads

**Priority:** Low

---

#### L-4: Hardcoded Path Limits

**Location:** `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/plugin/managers/security-hardening.ts:237`

**Description:** The URL decode function has a hardcoded iteration limit of 3.

```typescript
// Line 237
const maxIterations = 3; // Prevent infinite loops
```

**Risk:** Multi-layer encoded payloads with more than 3 levels of encoding could bypass detection.

**OWASP Category:** A03:2021 - Injection

**Remediation:**
1. Make the iteration limit configurable
2. Consider detecting and blocking suspiciously deep encoding
3. Add tests for multi-layer encoding bypass attempts

**Priority:** Low

---

#### L-5: Default Allow Behavior for Unknown Tools

**Location:** `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/plugin/managers/security-hardening.ts:611-614`

**Description:** The `validateToolInput` function defaults to allow for unrecognized tools.

```typescript
// Lines 611-614
// Default: allow
return { action: "allow" };
```

**Risk:** New or custom tools may bypass security validation entirely.

**OWASP Category:** A01:2021 - Broken Access Control

**Remediation:**
1. Consider a default-deny approach for unknown tools
2. Add configuration for tool allowlists/blocklists
3. Log unknown tool usage for security monitoring

**Priority:** Low

---

## OWASP Top 10 Assessment

| Category | Status | Notes |
|----------|--------|-------|
| A01 - Broken Access Control | **MODERATE** | Path traversal protection is good, but symlink attacks not addressed |
| A02 - Cryptographic Failures | **GOOD** | Uses crypto module for hashing; no encryption at rest for state files |
| A03 - Injection | **GOOD** | Strong command validation; some regex and editor concerns |
| A04 - Insecure Design | **MODERATE** | Good architecture; minor TOCTOU concerns |
| A05 - Security Misconfiguration | **GOOD** | Secure defaults enabled; pattern exposure in errors |
| A06 - Vulnerable Components | **GOOD** | Minimal dependencies; @inquirer/prompts is the main external dep |
| A07 - Auth Failures | **N/A** | No authentication implemented (plugin runs in user context) |
| A08 - Data Integrity | **GOOD** | No software update mechanism analyzed (update is user-initiated) |
| A09 - Logging Failures | **GOOD** | Comprehensive logging with PII filtering |
| A10 - SSRF | **N/A** | No server-side requests implemented |

---

## Positive Security Measures

The codebase demonstrates several excellent security practices:

### 1. Comprehensive Obfuscation Detection Pipeline
**Location:** `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/plugin/managers/security-hardening.ts:231-374`

The 5-stage pipeline (URL decode, hex decode, octal decode, quote stripping, backslash removal) effectively catches many common obfuscation techniques.

### 2. Fail-Closed Error Handling
**Location:** `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/plugin/managers/security-hardening.ts:456-461`

```typescript
// On validation error, deny the command
return {
  action: "deny",
  reason: "Validation error - command denied for safety",
};
```

### 3. Robust PII Filtering
**Location:** `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/lib/session-logger.ts:111-138`

Comprehensive patterns for filtering:
- Email addresses
- API keys and tokens
- Credit card numbers
- SSNs and phone numbers
- JWT tokens
- AWS/GitHub credentials
- Private keys
- Password patterns

### 4. Path Traversal Protection
**Location:** `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/plugin/managers/security-hardening.ts:493-521`

Multi-layer defense including:
- URL decoding before validation
- Separator normalization
- Traversal sequence detection (../,..\, etc.)
- URL-encoded traversal detection (%2e%2e)

### 5. Performance-Conscious Security
**Location:** `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/plugin/managers/security-hardening.ts:682-760`

LRU caching of validation results prevents re-processing the same commands while maintaining security posture.

### 6. Sensitive File Protection
**Location:** `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/plugin/managers/security-hardening.ts:142-186`

Comprehensive blocklist for sensitive files including:
- Environment and secret files
- Cryptographic keys (PEM, KEY, PFX)
- SSH keys and configuration
- Cloud credentials (AWS, GCloud, Azure, Kubernetes)
- Database credentials

### 7. Hook Error Isolation
**Location:** `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/plugin/utils.ts:50-73`

The `wrapHook` function ensures that hook failures don't crash the application and provide safe defaults.

---

## Dependency Security Analysis

### Direct Dependencies
| Package | Version | Risk Assessment |
|---------|---------|-----------------|
| @inquirer/prompts | ^7.0.0 | **LOW** - Well-maintained, interactive prompts only |

### Dev Dependencies
| Package | Version | Risk Assessment |
|---------|---------|-----------------|
| @types/node | ^20.11.0 | **NONE** - Type definitions only |
| @types/bun | ^1.2.0 | **NONE** - Type definitions only |
| typescript | ^5.3.0 | **NONE** - Build-time only |

### Peer Dependencies
| Package | Version | Risk Assessment |
|---------|---------|-----------------|
| @opencode-ai/plugin | >=0.1.0 (optional) | **LOW** - Type definitions for host environment |

**Supply Chain Assessment:** The codebase has minimal external dependencies, significantly reducing supply chain risk. The only runtime dependency (@inquirer/prompts) is a well-maintained Inquirer.js component for CLI prompts.

---

## Recommendations Summary

### Immediate Actions (High Priority)
1. **Sanitize editor commands** in conflict-resolution.ts
2. **Replace execSync** with execFile/spawnSync in doctor.ts
3. **Remove pattern exposure** from user-facing error messages

### Short-Term Actions (Medium Priority)
4. Add symlink attack protection to file operations
5. Implement input length limits before regex operations
6. Secure the atomic write implementation with proper permissions
7. Add schema validation for JSON configuration files

### Long-Term Improvements (Low Priority)
8. Expand Unicode homoglyph coverage
9. Implement rate limiting for validation operations
10. Consider default-deny for unknown tools
11. Add configurable encoding depth limits

---

## Security Best Practices Compliance

| Best Practice | Compliance | Notes |
|--------------|------------|-------|
| Input Validation | **HIGH** | Comprehensive command/path validation |
| Output Encoding | **MEDIUM** | Log sanitization present; could be stronger |
| Error Handling | **HIGH** | Fail-closed approach; good exception handling |
| Logging Security | **HIGH** | PII filtering; structured logging |
| Secrets Management | **MEDIUM** | No hardcoded secrets; file protection good |
| Dependency Management | **HIGH** | Minimal dependencies; explicit versioning |
| Secure Defaults | **HIGH** | Security features enabled by default |
| Least Privilege | **MEDIUM** | Runs in user context; no privilege escalation |

---

## Conclusion

The Atreides-OpenCode plugin demonstrates mature security engineering with a defense-in-depth approach. The security hardening module is particularly well-designed, with comprehensive pattern matching, multi-stage obfuscation detection, and robust PII filtering.

The identified vulnerabilities are primarily in the CLI tooling rather than the core security module. The most critical items (H-1, H-2) relate to shell command execution and should be addressed before production deployment.

**Recommendation:** Address high-severity findings before production release. The codebase is suitable for production use after remediation of identified issues.

---

*Report generated by Security Engineer Agent*
*Methodology: Static code analysis with focus on OWASP Top 10, CWE patterns, and secure coding practices*
