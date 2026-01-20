# Epic Brief: Atreides OpenCode Migration

## Summary

Atreides is an AI orchestration system that helps developers work with AI assistants through structured workflows, agent delegation, and safety guardrails. This Epic covers the implementation of Atreides for OpenCode as a modern plugin distributed via npm. The original Atreides was a proof-of-concept in Claude Code that demonstrated the value of structured AI orchestration but was limited by platform constraints. This implementation leverages OpenCode's enhanced capabilities to deliver the full vision: a 6-week MVP with core workflows, essential agents, and security features, followed by 18 weeks of post-MVP enhancements across 6 phases. This planning Epic will produce comprehensive specs and tickets for the entire project (MVP + all post-MVP phases), organized by major components, to guide future implementation Epics.

## Context & Problem

### Who's Affected

**Developers Seeking AI Orchestration** (Primary)
- Developers who want structured AI assistance with workflows, agent delegation, and safety guardrails
- Need simple installation and clear onboarding
- Want customizable orchestration that adapts to their project needs

**OpenCode Users** (Primary)
- Developers already using OpenCode who want enhanced orchestration capabilities
- Need plugin that integrates seamlessly with OpenCode's model selection and permissions
- Want to leverage OpenCode's agent and skill systems with structured workflows

**Atreides Maintainers** (Secondary)
- Face challenges maintaining shell scripts, templates, and cross-platform compatibility
- Need modern TypeScript codebase with proper testing and CI/CD
- Want extensible architecture for future enhancements

**OpenCode Ecosystem** (Secondary)
- Benefits from a sophisticated orchestration plugin that demonstrates platform capabilities
- Gains reference implementation for complex plugin patterns (hooks, agents, skills)

### Current Pain Points

**Distribution & Installation**
- Need standard package manager distribution (npm)
- Want simple installation via `npx atreides-opencode init`
- Require version management and easy updates
- Need clear onboarding and configuration wizard

**Maintenance & Extensibility**
- Need modern TypeScript codebase with type safety
- Want comprehensive testing and CI/CD
- Require extensible architecture for future enhancements
- Need clear separation between plugin code and user customizations

**User Experience**
- Need interactive onboarding wizard
- Want project type detection and language-specific defaults
- Require diagnostic tools to verify installation
- Need clear documentation and error messages

**Security & Safety**
- Security patterns scattered across multiple shell scripts
- No centralized validation or obfuscation detection
- Difficult to audit and verify security measures
- Limited test coverage for security features

### Where in the Product

This migration affects the **entire Atreides system**:
- **CLI layer**: Installation, configuration, diagnostics
- **Runtime layer**: Session management, workflow orchestration, error recovery
- **Security layer**: Command validation, file guards, log sanitization
- **Agent layer**: 8 specialized agents with model configurations
- **Skill layer**: 12 reusable skills with context isolation
- **Configuration layer**: Project setup, permissions, backward compatibility

### Success Criteria

**For Users**
- Simple installation: `npx atreides-opencode init` creates working project in <2 minutes
- Interactive wizard: Project detection, model configuration, permission setup
- Comprehensive testing: 466 tests ensure reliability and security
- High performance: <100ms plugin load time, <10ms hook overhead

**For Maintainers**
- Modern codebase: TypeScript with full type safety and IDE support
- Comprehensive testing: >80% coverage with security-focused test suite
- Standard distribution: npm package with semantic versioning
- Extensible architecture: Plugin hooks enable future enhancements without core changes

**For the Project**
- Complete feature set: All planned functionality from master plan
- Enhanced security: Obfuscation detection, comprehensive blocked patterns, file guards
- Excellent UX: Interactive wizard, project type detection, language-specific configs
- Clear roadmap: MVP + 6 post-MVP phases with defined scope and timelines
- Learning from POC: Incorporates insights from Claude Code proof-of-concept
