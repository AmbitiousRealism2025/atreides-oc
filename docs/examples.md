# Examples

Real-world examples of using Atreides OpenCode.

## Feature Development

### Adding User Authentication

**User Request**:
```
Add JWT authentication to the API
```

**AI Response with Atreides**:

```
[Intent Phase]
I understand you want to add JWT authentication. Let me clarify:
- Should this be for API endpoints only, or also web sessions?
- Do you have a preferred JWT library?
- Should I implement refresh tokens?
```

After clarification:

```
[Assessment Phase]
This is a medium-complexity task requiring:
- JWT token generation and validation
- User login endpoint
- Protected route middleware
- Token refresh mechanism

Estimated changes: 5-7 files

[Exploration Phase]
Delegating to Explore agent to find existing auth patterns...

Found:
- User model in src/models/user.ts
- Existing middleware pattern in src/middleware/
- API route structure in src/routes/

[Implementation Phase]
Creating task list:
- [ ] Install jsonwebtoken package
- [ ] Create auth middleware
- [ ] Add login endpoint
- [ ] Add token refresh endpoint
- [ ] Protect existing routes
- [ ] Add tests

Starting with auth middleware...

[Verification Phase]
All tasks complete. Running verification:
- Tests passing
- Build successful
- No security vulnerabilities

Authentication system ready.
```

---

### Adding Pagination

**User Request**:
```
Add pagination to the /api/users endpoint
```

**AI with Atreides**:

```
[Intent]
Adding pagination to GET /api/users with query params for page/limit.

[Assessment]
Straightforward change - single endpoint modification.
Will also update: types, tests, documentation.

[Exploration]
Delegating to Explore agent...
Found endpoint in src/routes/users.ts
Current implementation returns all users.

[Implementation]
Changes:
1. Add page/limit query params (default: page=1, limit=20)
2. Update Prisma query with skip/take
3. Return pagination metadata in response
4. Update TypeScript types
5. Update tests

[Verification]
- Endpoint tested with: /api/users?page=2&limit=10
- Returns correct subset
- Includes total count and page info
- Tests passing
```

---

## Bug Fixing

### Fixing a Login Bug

**User Request**:
```
Users are being logged out randomly. Fix this bug.
```

**AI with Atreides**:

```
[Intent]
Random logout issue - need to investigate session/token handling.

[Assessment]
Could be:
- Token expiration
- Session invalidation
- Cookie issues
- Race conditions

Need to explore authentication code.

[Exploration]
Delegating to Explore agent for auth-related files...
Delegating to Stilgar agent for deep analysis...

Found potential issues:
1. Token expiry set to 15 minutes (very short)
2. No refresh token implementation
3. Token validation has race condition

[Implementation]
Root cause: Token expiry too short + no refresh mechanism.

Fix:
1. Increase token expiry to 1 hour
2. Add refresh token (7 day expiry)
3. Add token refresh endpoint
4. Update frontend to refresh before expiry

Creating task list...

[Verification]
- Token expiry now 1 hour
- Refresh token working
- Tested login persistence across session
- Bug resolved
```

---

## Refactoring

### Extracting a Service Layer

**User Request**:
```
Refactor user logic out of routes into a service layer
```

**AI with Atreides**:

```
[Intent]
Extract user business logic from route handlers into dedicated service.

[Assessment]
Delegating to Plan agent for architecture decision...

Plan agent recommends:
- Create src/services/user.service.ts
- Move all user business logic
- Keep routes thin (validation + response)
- Add service-level error handling

[Exploration]
Current user logic locations:
- src/routes/users.ts (main CRUD)
- src/routes/auth.ts (user creation, validation)
- Inline logic in 3 controllers

[Implementation]
Creating task list:
- [ ] Create UserService class
- [ ] Move user CRUD logic
- [ ] Move user validation logic
- [ ] Update route handlers to use service
- [ ] Update tests
- [ ] Remove duplicate code

[Verification]
- All routes use UserService
- Tests passing
- No duplicate logic
- Clean separation of concerns
```

---

## Code Review

### Security Review

**User Request**:
```
Review the auth module for security issues
```

**AI with Atreides**:

```
[Intent]
Security audit of authentication implementation.

[Assessment]
Delegating to Stilgar agent for security expertise...

[Exploration]
Analyzing:
- src/services/auth.service.ts
- src/middleware/auth.middleware.ts
- src/routes/auth.ts
- Related configurations

[Stilgar Analysis]
Security findings:

HIGH:
1. Password stored with MD5 (weak) - use bcrypt
2. No rate limiting on login endpoint

MEDIUM:
3. JWT secret in source code - use env var
4. No token blacklist for logout

LOW:
5. Verbose error messages expose info
6. Missing security headers

Recommendations prioritized in task list.

[Implementation - if requested]
Shall I fix these issues? Starting with HIGH priority...
```

---

## Configuration Examples

### TypeScript Project Setup

```bash
# Initialize
cd my-typescript-project
npx atreides-opencode init

# Wizard selections:
# Project type: TypeScript (auto-detected)
# Mode: Standard
# Models: Accept defaults
# Permissions: TypeScript preset
```

Generated `opencode.json`:

```json
{
  "atreides": {
    "identity": {
      "personaName": "Muad'Dib"
    },
    "agents": {
      "stilgar": { "model": "claude-sonnet-4", "enabled": true },
      "explore": { "model": "claude-haiku-4-5", "enabled": true },
      "build": { "model": "claude-haiku-4-5", "enabled": true }
    },
    "permissions": {
      "bash": {
        "allow": ["npm *", "npx *", "node *", "tsc *"],
        "deny": ["rm -rf /", "sudo *"]
      }
    }
  }
}
```

### Python Project Setup

```bash
cd my-python-project
npx atreides-opencode init --project-type python
```

Generated permissions:

```json
{
  "atreides": {
    "permissions": {
      "bash": {
        "allow": ["pip *", "python *", "pytest *", "poetry *"],
        "deny": ["rm -rf /", "sudo *"]
      }
    }
  }
}
```

### Full Security Setup

```json
{
  "atreides": {
    "security": {
      "obfuscationDetection": true,
      "blockedPatterns": true,
      "fileGuards": true,
      "logSanitization": true,
      "customBlockedPatterns": [
        "curl.*\\|.*sh",
        "wget.*\\|.*bash"
      ],
      "customGuardedPaths": [
        ".env*",
        "**/*.key",
        "**/secrets/**",
        "**/credentials/**"
      ]
    }
  }
}
```

---

## Custom AGENTS.md Examples

### React Project

```markdown
# Orchestration

## Custom Rules

### Technology Stack
- Use React 18+ with functional components and hooks
- Use TypeScript strict mode
- Use Tailwind CSS for styling
- Use React Query for server state
- Use Zustand for client state

### Component Patterns
- One component per file
- Use named exports
- Props interface defined above component
- Maximum 150 lines per component

### File Structure
- Components in src/components/{feature}/
- Hooks in src/hooks/
- Utils in src/utils/
- Types in src/types/

### Testing
- Unit tests for utils with Vitest
- Component tests with Testing Library
- E2E tests with Playwright for critical flows
```

### API Project

```markdown
# Orchestration

## Custom Rules

### API Patterns
- RESTful endpoints following /api/v1/{resource}
- Use Zod for request validation
- Consistent error response format
- Rate limiting on all public endpoints

### Database
- Use Prisma ORM exclusively
- Migrations required for schema changes
- Soft deletes for user data

### Security
- Validate all input
- Sanitize all output
- Log security events
- No sensitive data in URLs

### Documentation
- OpenAPI spec updated with endpoint changes
- JSDoc for all public functions
```

### Monorepo Project

```markdown
# Orchestration

## Custom Rules

### Package Structure
- Shared code in packages/shared/
- Frontend in apps/web/
- API in apps/api/
- Use workspace dependencies

### Changes Across Packages
- Update shared types first
- Then update consumers
- Run full test suite

### Building
- Use turbo for builds
- Check dependent packages
```

---

## CLI Scripting Examples

### CI/CD Integration

```yaml
# .github/workflows/atreides-check.yml
name: Atreides Health Check

on: [push, pull_request]

jobs:
  health-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run Atreides Doctor
        run: npx atreides-opencode doctor --json > health.json

      - name: Check Health
        run: |
          if ! jq -e '.status == "healthy"' health.json > /dev/null; then
            echo "Atreides health check failed"
            cat health.json
            exit 1
          fi
```

### Auto-Update Script

```bash
#!/bin/bash
# scripts/update-atreides.sh

set -e

echo "Checking for Atreides updates..."

if npx atreides-opencode update --check 2>&1 | grep -q "Update available"; then
    echo "Update available, applying..."
    npx atreides-opencode update --backup

    echo "Verifying update..."
    npx atreides-opencode doctor

    echo "Update complete!"
else
    echo "Already at latest version."
fi
```

### Project Setup Script

```bash
#!/bin/bash
# scripts/setup-project.sh

PROJECT_DIR=$1
PROJECT_TYPE=${2:-"typescript"}

if [ -z "$PROJECT_DIR" ]; then
    echo "Usage: ./setup-project.sh <project-dir> [project-type]"
    exit 1
fi

mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

# Initialize based on project type
case $PROJECT_TYPE in
    typescript)
        npm init -y
        npm install typescript @types/node --save-dev
        npx tsc --init
        ;;
    python)
        python -m venv venv
        source venv/bin/activate
        pip install pytest
        ;;
esac

# Initialize Atreides
npx atreides-opencode init --mode standard --project-type $PROJECT_TYPE -y

# Verify
npx atreides-opencode doctor

echo "Project setup complete at $PROJECT_DIR"
```
