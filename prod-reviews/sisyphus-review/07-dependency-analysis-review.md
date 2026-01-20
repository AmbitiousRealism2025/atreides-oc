# Production Dependency Analysis — Atreides OpenCode (`atreides-opencode`)

## Executive Summary
- The project is **very lean**: **1 production dependency** (`@inquirer/prompts`) and **3 devDependencies** (`typescript`, `@types/node`, `@types/bun`), plus **1 optional peer** (`@opencode-ai/plugin`).
- Lockfile shows **37 total packages installed** (including transitives), which is small for a Node CLI.
- The main hygiene opportunities are (1) **deciding whether the CLI should bundle dependencies** (it appears to), (2) **establishing a workable vulnerability scanning path** (Bun doesn't provide `audit`), and (3) considering a **major upgrade** to `@inquirer/prompts@8` only if needed.

---

## Dependency Inventory (declared + actual usage)

### Production dependencies (`package.json`)
- `@inquirer/prompts` (`^7.0.0`, locked to `7.10.1`)
  - Purpose: interactive CLI UX (`select`, `confirm`, `checkbox`, etc.)
  - Evidence of usage: imported directly in multiple CLI files, e.g. `src/cli/init.ts`, `src/cli/migrate.ts`, `src/cli/uninstall.ts`, `src/cli/restore.ts`.

### Peer dependencies
- `@opencode-ai/plugin` (`>=0.1.0`, optional)
  - Purpose: ecosystem compatibility marker (OpenCode plugin host).
  - Note: I found no runtime imports from `src/`—only references/comments plus a local type shim in `src/types/opencode-plugin.d.ts`. This peer dep is "policy/compatibility", not a hard runtime requirement.

### Dev dependencies
- `typescript` (`^5.3.0`, locked to `5.9.3`)
  - Purpose: typechecking and `.d.ts` generation (`tsc --emitDeclarationOnly`).
- `@types/node` (`^20.11.0`, locked to `20.19.30`)
  - Purpose: Node typings for TS.
- `@types/bun` (`^1.2.0`, locked to `1.3.6`)
  - Purpose: Bun typings.

### Transitive dependency set (from `bun.lock`)
Main transitive families come from `@inquirer/prompts`:
- `@inquirer/*` packages (core/select/checkbox/etc.)
- terminal formatting helpers: `wrap-ansi`, `string-width`, `strip-ansi`, `ansi-styles`, `ansi-regex`
- small utilities: `cli-width`, `signal-exit`, `mute-stream`, `yoctocolors-cjs`
- external editor support: `@inquirer/external-editor` → `iconv-lite`, `chardet`

---

## Security Assessment
### Current state
- No lockfile compatible with `npm audit` is present (`package-lock.json` is missing), so **I could not run `npm audit --omit=dev`**. Bun also **does not provide** `bun pm audit`.
- Based on composition, the risk surface is relatively low:
  - Only one production dependency, and it's a reputable CLI prompting library.
  - No historically "high-risk" legacy deps (e.g., deprecated request stack, old lodash ranges, etc.) show up in the lock snippet.

### Practical recommendation (security scanning)
- Add **at least one** automated advisory source in CI:
  - Option A (minimal, no repo changes): in CI, run `npm i --package-lock-only --ignore-scripts` then `npm audit --omit=dev`.
  - Option B (better UX): add an OSS scanner like OSV or Dependabot (usually wants a lockfile, depending on setup).

---

## Bundle Size Analysis
### Observed artifact sizes (current workspace build outputs)
- `dist/` total: **~1.0 MB**
- `dist/cli/index.js`: **~305 KB**
- `dist/plugin/index.js`: **~143 KB**
- Dev install `node_modules/`: **~31 MB** (includes TypeScript and type packages)

### Likely size drivers
- The single largest logical contributor is `@inquirer/prompts` and its transitive terminal formatting stack.
- The CLI build appears to be **bundled** (no obvious `from "@inquirer/prompts"` remains in `dist/**/*.js`), meaning:
  - Users may be getting dependency code duplicated: once bundled in `dist/cli/index.js`, and again installed via `dependencies`.

This isn't "bad", but it's a conscious packaging choice worth locking down.

---

## Unused / Redundant Dependencies
- **No unused declared deps detected.** The only prod dependency is used.
- Potential redundancy to confirm:
  - If `bun build` is bundling `@inquirer/prompts` into `dist/cli/index.js`, then `@inquirer/prompts` may be **unnecessary at runtime** (but still needed at build time).
  - If you want to keep single-file distribution, you could move `@inquirer/prompts` to `devDependencies` (and test installing from the packed tarball to confirm the CLI still runs).
  - If you want traditional Node packaging, pass `--external:@inquirer/prompts` to `bun build` and keep it in `dependencies`.

Primary suggestion: pick one model and enforce it.

---

## Version Policy Evaluation
### What's pinned vs what's actually installed
- `@inquirer/prompts`: `^7.0.0` → installed `7.10.1`; latest registry shows **`8.2.0`**.
- `typescript`: `^5.3.0` → installed `5.9.3`; registry latest is **`5.9.3`** (already current).
- `@types/node`: `^20.11.0` → installed `20.19.30`; registry latest is **`25.0.9`**.

### Assessment
- Using caret ranges is reasonable here (small surface area, CLI library, Bun lock for development reproducibility).
- I would *not* chase `@types/node@25` unless you also change `engines.node` upward and validate types across the project.

---

## Recommendations for Dependency Hygiene

1) **Decide and enforce your packaging model**
- If you want **bundled** CLI/plugin:
  - Verify that `dist/cli/index.js` and `dist/plugin/index.js` run without installing `dependencies`.
  - If true: consider moving `@inquirer/prompts` to `devDependencies` to reduce consumer install size.
- If you want **non-bundled** output:
  - Add `--external:@inquirer/prompts` to the build scripts and keep it as a production dependency.

2) **Add a vulnerability scanning path**
- Bun alone won't give you an audit report.
- Add CI that generates a temporary npm lock and runs `npm audit --omit=dev`, or use an advisory scanner (OSV/Dependabot).

3) **Be deliberate about major upgrades**
- `@inquirer/prompts@8` exists (latest `8.2.0`). Only upgrade if you have a reason (features/bugfix/security), because it's a major and may introduce subtle behavior changes.

---

# Action Plan (minimal path)
1. Confirm whether `bun build` is bundling `@inquirer/prompts` into `dist`.
2. Choose one packaging model (bundled vs externalized) and align `dependencies` accordingly.
3. Add CI security scanning (temporary `package-lock` generation + `npm audit`, or OSV/Dependabot).
4. Optional: schedule a controlled upgrade test to `@inquirer/prompts@8.x`.

## Effort estimate
**Short (1–4h)** for confirming bundling + adding CI audit + minor `package.json` adjustments.

--- 

## Escalation triggers (when to revisit with a more complex approach)
- You add more runtime deps (HTTP clients, markdown parsers, templating, etc.) → consider a stricter version policy and automated "unused dependency" checks.
- You distribute both "library" and "single-file CLI" artifacts → consider split entrypoints or separate `exports` builds to avoid duplicate dependency shipping.

---

*Review completed: Dependency Analysis Review*
*Reviewer: Oracle Agent*
