# [MVP-CLI3] Implement Doctor Command & Diagnostics

## Context

Implement the `doctor` command that verifies Atreides installation and diagnoses issues. This provides users with a comprehensive health check and troubleshooting guidance.

**References**:
- Component Spec: spec:bf063507-9358-4515-afbb-3080f2099467/1a9e73e5-842b-422a-b385-2609d57c2172
- Core Flows: spec:bf063507-9358-4515-afbb-3080f2099467/f32d7c5a-99f4-4e9f-99f3-c04d552db8c7 (Flow 3)
- Master Plan: file:ATREIDES_OC_MASTER_PLAN.md (Section 8: Onboarding & CLI)

**Dependencies**:
- ticket:bf063507-9358-4515-afbb-3080f2099467/571324aa-79f0-4026-bccd-8602bf38968f (Init must generate files to check)

---

## Scope

### In Scope
- Doctor command implementation
- OpenCode installation check
- Plugin loading verification
- Agent file validation
- Skill file validation
- Configuration syntax check
- Security pattern verification
- Traffic light summary (green/yellow/red)
- Detailed diagnostic output
- Remediation suggestions

### Out of Scope
- Automatic fixes (suggest only)
- Performance diagnostics
- Network connectivity checks
- Advanced troubleshooting

---

## Implementation Guidance

### Diagnostic Categories

```typescript
interface DiagnosticResult {
  category: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  details?: string[]
  remediation?: string
}

class DoctorCommand {
  async run(): Promise<void> {
    const results: DiagnosticResult[] = []
    
    // Run all checks
    results.push(await this.checkOpenCode())
    results.push(await this.checkPlugin())
    results.push(await this.checkAgents())
    results.push(await this.checkSkills())
    results.push(await this.checkConfiguration())
    results.push(await this.checkSecurity())
    
    // Determine overall status
    const overallStatus = this.calculateOverallStatus(results)
    
    // Display results
    this.displayResults(overallStatus, results)
  }
  
  private async checkOpenCode(): Promise<DiagnosticResult> {
    try {
      // Check if OpenCode is installed
      const opencodeVersion = await this.getOpenCodeVersion()
      
      if (!opencodeVersion) {
        return {
          category: 'OpenCode Installation',
          status: 'fail',
          message: 'OpenCode not found',
          remediation: 'Install OpenCode from https://opencode.ai'
        }
      }
      
      return {
        category: 'OpenCode Installation',
        status: 'pass',
        message: `OpenCode ${opencodeVersion} installed`
      }
    } catch (error) {
      return {
        category: 'OpenCode Installation',
        status: 'fail',
        message: 'Failed to check OpenCode',
        details: [error.message]
      }
    }
  }
  
  private async checkPlugin(): Promise<DiagnosticResult> {
    // Check if plugin is referenced in opencode.json
    // Check if plugin can be loaded
    // Verify hook registration
  }
  
  private async checkAgents(): Promise<DiagnosticResult> {
    // Check if agent files exist
    // Validate agent markdown syntax
    // Verify model configurations
    // Check for required agents (Stilgar, Explore, etc.)
  }
  
  private async checkSkills(): Promise<DiagnosticResult> {
    // Check if skill files exist
    // Validate skill frontmatter
    // Verify context types
    // Check for required skills (base, orchestrate, etc.)
  }
  
  private async checkConfiguration(): Promise<DiagnosticResult> {
    // Validate opencode.json syntax
    // Check AGENTS.md syntax
    // Verify permission configurations
  }
  
  private async checkSecurity(): Promise<DiagnosticResult> {
    // Verify security patterns loaded
    // Check blocked command patterns
    // Validate file guards
  }
  
  private calculateOverallStatus(results: DiagnosticResult[]): 'green' | 'yellow' | 'red' {
    // Weighted calculation (from architecture validation)
    const coreCategories = ['OpenCode Installation', 'Plugin', 'Configuration']
    const hasCoreFailure = results.some(r => 
      coreCategories.includes(r.category) && r.status === 'fail'
    )
    
    if (hasCoreFailure) return 'red'
    
    const hasAnyFailure = results.some(r => r.status === 'fail')
    if (hasAnyFailure) return 'yellow'
    
    const hasWarning = results.some(r => r.status === 'warn')
    if (hasWarning) return 'yellow'
    
    return 'green'
  }
  
  private displayResults(overall: string, results: DiagnosticResult[]): void {
    // Traffic light summary
    const icon = overall === 'green' ? '🟢' : overall === 'yellow' ? '🟡' : '🔴'
    const status = overall === 'green' ? 'All checks passed' : 
                   overall === 'yellow' ? 'System functional with warnings' :
                   'Critical issues found'
    
    console.log(`\n${icon} ${status}\n`)
    
    // Detailed breakdown
    for (const result of results) {
      const statusIcon = result.status === 'pass' ? '✓' : 
                         result.status === 'warn' ? '⚠' : '✗'
      console.log(`${statusIcon} ${result.category}: ${result.message}`)
      
      if (result.details) {
        result.details.forEach(detail => console.log(`  - ${detail}`))
      }
      
      if (result.remediation) {
        console.log(`  → ${result.remediation}`)
      }
    }
  }
}
```

---

## Acceptance Criteria

### Functional
- [ ] Doctor command implemented
- [ ] All 6 diagnostic categories checked
- [ ] Traffic light summary displayed (green/yellow/red)
- [ ] Detailed breakdown shown
- [ ] Remediation suggestions provided
- [ ] Overall status calculated correctly (weighted)
- [ ] Exit code reflects status (0=green, 1=yellow, 2=red)

### Quality
- [ ] Unit tests for each diagnostic check
- [ ] Unit tests for status calculation
- [ ] Integration tests with actual project
- [ ] Error handling tested
- [ ] Performance: <1s total execution time

### Documentation
- [ ] CLI help text
- [ ] Diagnostic categories documented
- [ ] Remediation guide

---

## Testing Strategy

```typescript
describe('Doctor Command', () => {
  test('detects missing OpenCode', async () => {
    mockOpenCodeCheck.mockResolvedValue(null)
    
    const results = await doctor.run()
    expect(results.overallStatus).toBe('red')
    expect(results.results[0].status).toBe('fail')
  })
  
  test('validates agent files', async () => {
    // Create invalid agent file
    writeFileSync('.opencode/agent/test.md', 'Invalid content')
    
    const results = await doctor.run()
    const agentCheck = results.results.find(r => r.category === 'Agents')
    expect(agentCheck.status).toBe('fail')
  })
  
  test('calculates overall status correctly', () => {
    const results = [
      { category: 'Plugin', status: 'fail' },  // Core failure
      { category: 'Agents', status: 'pass' }
    ]
    
    expect(calculateOverallStatus(results)).toBe('red')
  })
})
```

---

## Effort Estimate

**From Master Plan**: 2 days (Week 5)