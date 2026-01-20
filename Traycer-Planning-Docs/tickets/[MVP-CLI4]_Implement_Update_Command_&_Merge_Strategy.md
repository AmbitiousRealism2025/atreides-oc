# [MVP-CLI4] Implement Update Command & Merge Strategy

## Context

Implement the `update` command that updates Atreides to the latest version while preserving user customizations. This uses structural detection and interactive conflict resolution to merge template updates with user modifications.

**References**:
- Component Spec: spec:bf063507-9358-4515-afbb-3080f2099467/1a9e73e5-842b-422a-b385-2609d57c2172
- Technical Plan: spec:bf063507-9358-4515-afbb-3080f2099467/5cdb5788-a716-4cb2-a301-6ccd6f64a488 (Section 3.5)
- Core Flows: spec:bf063507-9358-4515-afbb-3080f2099467/f32d7c5a-99f4-4e9f-99f3-c04d552db8c7 (Flow 4)

**Dependencies**:
- ticket:bf063507-9358-4515-afbb-3080f2099467/571324aa-79f0-4026-bccd-8602bf38968f (Init must generate manifest)

---

## Scope

### In Scope
- Update command implementation
- npm version checking
- Package update (npm update atreides-opencode)
- Customization detection (structural, hash-based)
- Template merging (AGENTS.md, agent files, opencode.json)
- Interactive conflict resolution
- Backup creation
- Update summary display

### Out of Scope
- Automatic conflict resolution (always interactive)
- Rollback functionality (manual via backup)
- Migration scripts for breaking changes

---

## Implementation Guidance

### Update Flow

```typescript
class UpdateCommand {
  async run(): Promise<void> {
    console.log('Checking for updates...')
    
    // 1. Check npm for latest version
    const latestVersion = await this.getLatestVersion()
    const currentVersion = await this.getCurrentVersion()
    
    if (latestVersion === currentVersion) {
      console.log('Already up to date!')
      return
    }
    
    console.log(`Update available: ${currentVersion} → ${latestVersion}`)
    
    // 2. Create backup
    await this.createBackup()
    
    // 3. Update npm package
    await this.updatePackage()
    
    // 4. Load customization manifest
    const manifest = await this.loadManifest()
    
    // 5. Merge files
    const conflicts = await this.mergeFiles(manifest)
    
    // 6. Handle conflicts interactively
    if (conflicts.length > 0) {
      await this.resolveConflicts(conflicts)
    }
    
    // 7. Update manifest
    await this.updateManifest()
    
    // 8. Show summary
    this.displaySummary()
  }
  
  private async mergeFiles(manifest: CustomizationManifest): Promise<Conflict[]> {
    const conflicts: Conflict[] = []
    
    // Merge AGENTS.md
    const agentsMdConflict = await this.mergeAgentsMd(manifest)
    if (agentsMdConflict) conflicts.push(agentsMdConflict)
    
    // Merge agent files
    for (const agentFile of await this.getAgentFiles()) {
      const conflict = await this.mergeAgentFile(agentFile, manifest)
      if (conflict) conflicts.push(conflict)
    }
    
    // Merge opencode.json
    const configConflict = await this.mergeConfig(manifest)
    if (configConflict) conflicts.push(configConflict)
    
    return conflicts
  }
  
  private async mergeAgentsMd(manifest: CustomizationManifest): Promise<Conflict | null> {
    const currentPath = 'AGENTS.md'
    const currentContent = await readFile(currentPath, 'utf-8')
    const newTemplate = await this.getNewTemplate('AGENTS.md')
    
    // Structural detection: Parse markdown AST
    const currentAst = parseMarkdown(currentContent)
    const templateAst = parseMarkdown(newTemplate)
    
    // Detect user-added sections
    const userSections = this.detectUserSections(currentAst, templateAst)
    
    // Detect modified sections
    const modifiedSections = this.detectModifiedSections(currentAst, templateAst)
    
    if (userSections.length === 0 && modifiedSections.length === 0) {
      // No customizations, replace with new template
      await writeFile(currentPath, newTemplate)
      return null
    }
    
    // Attempt structural merge
    try {
      const merged = this.structuralMerge(currentAst, templateAst, userSections, modifiedSections)
      await writeFile(currentPath, renderMarkdown(merged))
      return null
    } catch (error) {
      // Merge conflict
      return {
        file: currentPath,
        type: 'structural',
        userContent: currentContent,
        newTemplate: newTemplate,
        conflictingSections: modifiedSections
      }
    }
  }
  
  private async resolveConflicts(conflicts: Conflict[]): Promise<void> {
    for (const conflict of conflicts) {
      console.log(`\n⚠️  Merge conflict detected in ${conflict.file}\n`)
      
      // Show conflict details
      this.displayConflict(conflict)
      
      // Prompt for resolution
      const choice = await this.promptResolution()
      
      switch (choice) {
        case 'keep':
          // Keep user version
          break
        case 'use-new':
          // Use new template
          await writeFile(conflict.file, conflict.newTemplate)
          break
        case 'merge':
          // Open editor for manual merge
          await this.openEditor(conflict.file)
          break
        case 'skip':
          // Skip this file
          console.log('Skipped. You can resolve manually later.')
          break
      }
    }
  }
  
  private async promptResolution(): Promise<string> {
    const { choice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: 'Choose resolution:',
        choices: [
          { name: '1. Keep your version (preserve customization)', value: 'keep' },
          { name: '2. Use new template (get latest updates)', value: 'use-new' },
          { name: '3. Merge manually (open editor)', value: 'merge' },
          { name: '4. Skip this file (resolve later)', value: 'skip' }
        ]
      }
    ])
    
    return choice
  }
}
```

### Structural Detection

```typescript
function detectUserSections(currentAst: MarkdownAST, templateAst: MarkdownAST): string[] {
  const templateSections = extractSectionHeaders(templateAst)
  const currentSections = extractSectionHeaders(currentAst)
  
  // User-added sections are in current but not in template
  return currentSections.filter(section => !templateSections.includes(section))
}

function detectModifiedSections(currentAst: MarkdownAST, templateAst: MarkdownAST): string[] {
  const modified: string[] = []
  
  for (const section of extractSections(templateAst)) {
    const currentSection = findSection(currentAst, section.header)
    
    if (currentSection && currentSection.content !== section.content) {
      modified.push(section.header)
    }
  }
  
  return modified
}
```

---

## Acceptance Criteria

### Functional
- [ ] Update command implemented
- [ ] Version checking working (npm registry)
- [ ] Package update working (npm update)
- [ ] Backup creation working
- [ ] Structural detection for AGENTS.md
- [ ] Hash-based detection for agent files
- [ ] Deep object merge for opencode.json
- [ ] Interactive conflict resolution
- [ ] Update summary displayed

### Quality
- [ ] Unit tests for merge logic
- [ ] Unit tests for conflict detection
- [ ] Integration tests with actual updates
- [ ] Error handling tested (network failures, invalid files)
- [ ] Performance: <5s for typical update

### Documentation
- [ ] CLI help text
- [ ] Merge strategy documented
- [ ] Conflict resolution guide

---

## Testing Strategy

```typescript
describe('Update Command', () => {
  test('detects user-added sections in AGENTS.md', async () => {
    // Add custom section
    const agentsMd = await readFile('AGENTS.md', 'utf-8')
    const customized = agentsMd + '\n## My Custom Rules\n...'
    await writeFile('AGENTS.md', customized)
    
    const userSections = await detectUserSections()
    expect(userSections).toContain('My Custom Rules')
  })
  
  test('preserves customizations during update', async () => {
    // Customize AGENTS.md
    await addCustomSection('AGENTS.md', 'Custom Rules')
    
    // Run update
    await update.run()
    
    // Verify custom section preserved
    const updated = await readFile('AGENTS.md', 'utf-8')
    expect(updated).toContain('Custom Rules')
  })
  
  test('prompts for conflict resolution', async () => {
    // Create conflict scenario
    await modifyTemplateSection('AGENTS.md', 'Workflow')
    
    // Mock user choice
    mockPrompt.mockResolvedValue({ choice: 'keep' })
    
    await update.run()
    expect(mockPrompt).toHaveBeenCalled()
  })
})
```

---

## Effort Estimate

**From Master Plan**: 3 days (Week 5-6)