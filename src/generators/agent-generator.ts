/**
 * Agent Generator
 *
 * Generates agent markdown files from templates for OpenCode.
 * Handles template loading, variable substitution, and file output.
 */

import { readFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FileManager } from "../lib/file-manager.js";
import {
  createManifest,
  createMarkdownFileEntry,
  extractMarkdownSections,
  saveManifest,
  loadManifest,
  updateFileEntry,
  type CustomizationManifest,
} from "../lib/manifest.js";
import { OPENCODE_DIR, AGENTS_DIR, PACKAGE_VERSION } from "../lib/constants.js";
import type {
  AgentConfig,
  AgentGenerationResult,
  AgentGenerationOptions,
  AgentFrontmatter,
} from "./types.js";

/**
 * Get the default templates directory (relative to package root)
 */
function getDefaultTemplateDir(): string {
  // In ESM, use import.meta.url to get the current module's directory
  const currentDir = dirname(fileURLToPath(import.meta.url));
  // Go up from src/generators to package root, then into templates/agents
  return join(currentDir, "..", "..", "templates", "agents");
}

/**
 * AgentGenerator class
 *
 * Handles generation of agent markdown files from templates.
 */
export class AgentGenerator {
  private readonly fileManager: FileManager;
  private readonly templateDir: string;
  private readonly overwrite: boolean;
  private templateCache: Map<string, string> = new Map();

  constructor(options: AgentGenerationOptions) {
    this.fileManager = new FileManager(options.outputDir);
    this.templateDir = options.templateDir ?? getDefaultTemplateDir();
    this.overwrite = options.overwrite ?? false;
  }

  /**
   * Load a template file by agent name
   */
  async loadTemplate(agentName: string): Promise<string> {
    // Check cache first
    if (this.templateCache.has(agentName)) {
      return this.templateCache.get(agentName)!;
    }

    const templatePath = join(this.templateDir, `${agentName}.md.template`);

    try {
      const content = await readFile(templatePath, "utf-8");
      this.templateCache.set(agentName, content);
      return content;
    } catch (error) {
      throw new Error(
        `Failed to load template for agent '${agentName}': ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Render a template with the given configuration
   */
  renderTemplate(template: string, config: AgentConfig): string {
    return template
      .replace(/\{\{name\}\}/g, config.name)
      .replace(/\{\{displayName\}\}/g, config.displayName)
      .replace(/\{\{model\}\}/g, config.model)
      .replace(/\{\{enabled\}\}/g, String(config.enabled));
  }

  /**
   * Parse frontmatter from rendered agent markdown
   */
  parseFrontmatter(content: string): AgentFrontmatter | null {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match || !match[1]) {
      return null;
    }

    const frontmatter: Record<string, string> = {};
    const lines = match[1].split("\n");

    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        frontmatter[key] = value;
      }
    }

    return {
      name: frontmatter.name ?? "",
      displayName: frontmatter.displayName ?? "",
      model: frontmatter.model ?? "",
      enabled: frontmatter.enabled === "true",
    };
  }

  /**
   * Validate rendered content has valid frontmatter
   */
  validateContent(content: string, agentName: string): void {
    const frontmatter = this.parseFrontmatter(content);

    if (!frontmatter) {
      throw new Error(`Invalid frontmatter in generated content for agent '${agentName}'`);
    }

    if (!frontmatter.name) {
      throw new Error(`Missing 'name' in frontmatter for agent '${agentName}'`);
    }

    if (!frontmatter.model) {
      throw new Error(`Missing 'model' in frontmatter for agent '${agentName}'`);
    }
  }

  /**
   * Get the output path for an agent file
   */
  getAgentOutputPath(agentName: string): string {
    return join(OPENCODE_DIR, AGENTS_DIR, `${agentName}.md`);
  }

  /**
   * Customization zone markers for agent templates.
   * Content between these markers is preserved during regeneration.
   */
  private static readonly CUSTOM_START = "<!-- CUSTOM RULES START -->";
  private static readonly CUSTOM_END = "<!-- CUSTOM RULES END -->";

  /**
   * Generate a single agent file.
   * Preserves user customizations within the CUSTOM RULES zone.
   */
  async generateAgentFile(config: AgentConfig): Promise<AgentGenerationResult> {
    const outputPath = this.getAgentOutputPath(config.name);

    try {
      // Ensure output directory exists
      const outputDir = dirname(outputPath);
      await mkdir(outputDir, { recursive: true });

      // Check if file already exists
      const exists = await this.fileManager.exists(outputPath);

      // If file exists and not overwriting, skip
      if (exists && !this.overwrite) {
        return {
          path: outputPath,
          created: false,
          updated: false,
        };
      }

      // Load and render template
      const template = await this.loadTemplate(config.name);
      let rendered = this.renderTemplate(template, config);

      // Preserve user customizations if file exists
      if (exists) {
        const existingContent = await this.fileManager.read(outputPath);
        const customContent = this.extractCustomContent(existingContent);
        if (customContent) {
          rendered = this.mergeCustomContent(rendered, customContent);
        }
      }

      // Validate the rendered content
      this.validateContent(rendered, config.name);

      // Write the file
      await this.fileManager.write(outputPath, rendered);

      return {
        path: outputPath,
        created: !exists,
        updated: exists,
      };
    } catch (error) {
      return {
        path: outputPath,
        created: false,
        updated: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Extract custom content from between CUSTOM markers.
   *
   * @param content - Existing file content
   * @returns Content between markers or undefined
   */
  private extractCustomContent(content: string): string | undefined {
    const startIndex = content.indexOf(AgentGenerator.CUSTOM_START);
    const endIndex = content.indexOf(AgentGenerator.CUSTOM_END);

    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
      return undefined;
    }

    const customContent = content.slice(
      startIndex + AgentGenerator.CUSTOM_START.length,
      endIndex
    ).trim();

    // Return undefined if only the placeholder comment exists
    if (customContent === "<!-- User customizations preserved here -->") {
      return undefined;
    }

    return customContent || undefined;
  }

  /**
   * Merge custom content back into rendered template.
   *
   * @param rendered - Newly rendered template
   * @param customContent - Custom content to preserve
   * @returns Merged content
   */
  private mergeCustomContent(rendered: string, customContent: string): string {
    const startIndex = rendered.indexOf(AgentGenerator.CUSTOM_START);
    const endIndex = rendered.indexOf(AgentGenerator.CUSTOM_END);

    if (startIndex === -1 || endIndex === -1) {
      return rendered;
    }

    const beforeCustom = rendered.slice(0, startIndex + AgentGenerator.CUSTOM_START.length);
    const afterCustom = rendered.slice(endIndex);

    return `${beforeCustom}\n${customContent}\n${afterCustom}`;
  }

  /**
   * Generate multiple agent files
   */
  async generateAgentFiles(
    configs: AgentConfig[]
  ): Promise<AgentGenerationResult[]> {
    const results: AgentGenerationResult[] = [];

    for (const config of configs) {
      const result = await this.generateAgentFile(config);
      results.push(result);
    }

    return results;
  }

  /**
   * Generate agent files and update manifest
   */
  async generateWithManifest(
    configs: AgentConfig[],
    projectPath: string
  ): Promise<{
    results: AgentGenerationResult[];
    manifest: CustomizationManifest;
  }> {
    // Load or create manifest
    let manifest = await loadManifest(projectPath);
    if (!manifest) {
      manifest = createManifest(PACKAGE_VERSION);
    }

    // Generate files
    const results = await this.generateAgentFiles(configs);

    // Update manifest for successfully generated files
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      const config = configs[i]!;

      if (result.created || result.updated) {
        // Load template and rendered content for manifest tracking
        const template = await this.loadTemplate(config.name);
        const rendered = this.renderTemplate(template, config);

        const templateSections = extractMarkdownSections(template);
        const renderedSections = extractMarkdownSections(rendered);

        const entry = createMarkdownFileEntry(
          result.path,
          rendered, // Use rendered as template (since we just generated it)
          rendered,
          renderedSections,
          templateSections
        );

        updateFileEntry(manifest, result.path, entry);
      }
    }

    // Save manifest
    await saveManifest(projectPath, manifest);

    return { results, manifest };
  }

  /**
   * Clear the template cache
   */
  clearCache(): void {
    this.templateCache.clear();
  }
}

/**
 * Factory function to create an AgentGenerator instance
 */
export function createAgentGenerator(
  options: AgentGenerationOptions
): AgentGenerator {
  return new AgentGenerator(options);
}

/**
 * Convenience function to generate all MVP agent files
 */
export async function generateMVPAgents(
  configs: AgentConfig[],
  projectPath: string,
  options?: Partial<AgentGenerationOptions>
): Promise<AgentGenerationResult[]> {
  const generator = createAgentGenerator({
    outputDir: projectPath,
    ...options,
  });

  const { results } = await generator.generateWithManifest(configs, projectPath);
  return results;
}

/**
 * Convenience function to generate Post-MVP agent files (Phase 1)
 */
export async function generatePostMVPAgents(
  configs: AgentConfig[],
  projectPath: string,
  options?: Partial<AgentGenerationOptions>
): Promise<AgentGenerationResult[]> {
  const generator = createAgentGenerator({
    outputDir: projectPath,
    ...options,
  });

  const { results } = await generator.generateWithManifest(configs, projectPath);
  return results;
}

/**
 * Convenience function to generate all agent files (MVP + Post-MVP)
 */
export async function generateAllAgents(
  configs: AgentConfig[],
  projectPath: string,
  options?: Partial<AgentGenerationOptions>
): Promise<AgentGenerationResult[]> {
  const generator = createAgentGenerator({
    outputDir: projectPath,
    ...options,
  });

  const { results } = await generator.generateWithManifest(configs, projectPath);
  return results;
}
