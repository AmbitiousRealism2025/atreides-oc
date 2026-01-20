/**
 * Skill Generator
 *
 * Generates skill markdown files from templates for OpenCode.
 * Handles template loading, variable substitution, and file output.
 *
 * Skills are stored in subdirectories: .opencode/skill/{name}/SKILL.md
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
import { OPENCODE_DIR, SKILLS_DIR, PACKAGE_VERSION } from "../lib/constants.js";
import type {
  SkillConfig,
  SkillGenerationResult,
  SkillGenerationOptions,
  SkillFrontmatter,
  SkillContextType,
} from "./skill-types.js";

/**
 * Get the default templates directory (relative to package root)
 */
function getDefaultTemplateDir(): string {
  // In ESM, use import.meta.url to get the current module's directory
  const currentDir = dirname(fileURLToPath(import.meta.url));
  // Go up from src/generators to package root, then into templates/skills
  return join(currentDir, "..", "..", "templates", "skills");
}

/**
 * SkillGenerator class
 *
 * Handles generation of skill markdown files from templates.
 */
export class SkillGenerator {
  private readonly fileManager: FileManager;
  private readonly templateDir: string;
  private readonly overwrite: boolean;
  private templateCache: Map<string, string> = new Map();

  constructor(options: SkillGenerationOptions) {
    this.fileManager = new FileManager(options.outputDir);
    this.templateDir = options.templateDir ?? getDefaultTemplateDir();
    this.overwrite = options.overwrite ?? false;
  }

  /**
   * Load a template file by skill name
   * Templates are in: templates/skills/{name}/SKILL.md.template
   */
  async loadTemplate(skillName: string): Promise<string> {
    // Check cache first
    if (this.templateCache.has(skillName)) {
      return this.templateCache.get(skillName)!;
    }

    const templatePath = join(
      this.templateDir,
      skillName,
      "SKILL.md.template"
    );

    try {
      const content = await readFile(templatePath, "utf-8");
      this.templateCache.set(skillName, content);
      return content;
    } catch (error) {
      throw new Error(
        `Failed to load template for skill '${skillName}': ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Render a template with the given configuration
   */
  renderTemplate(template: string, config: SkillConfig): string {
    return template
      .replace(/\{\{name\}\}/g, config.name)
      .replace(/\{\{contextType\}\}/g, config.contextType)
      .replace(/\{\{enabled\}\}/g, String(config.enabled))
      .replace(/\{\{description\}\}/g, config.description);
  }

  /**
   * Parse frontmatter from rendered skill markdown
   */
  parseFrontmatter(content: string): SkillFrontmatter | null {
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

    // Validate contextType
    const contextType = frontmatter.contextType as SkillContextType;
    if (contextType !== "main" && contextType !== "fork") {
      return null;
    }

    return {
      name: frontmatter.name ?? "",
      contextType,
      enabled: frontmatter.enabled === "true",
      description: frontmatter.description ?? "",
    };
  }

  /**
   * Validate rendered content has valid frontmatter
   */
  validateContent(content: string, skillName: string): void {
    const frontmatter = this.parseFrontmatter(content);

    if (!frontmatter) {
      throw new Error(
        `Invalid frontmatter in generated content for skill '${skillName}'`
      );
    }

    if (!frontmatter.name) {
      throw new Error(`Missing 'name' in frontmatter for skill '${skillName}'`);
    }

    if (!frontmatter.contextType) {
      throw new Error(
        `Missing 'contextType' in frontmatter for skill '${skillName}'`
      );
    }

    if (!frontmatter.description) {
      throw new Error(
        `Missing 'description' in frontmatter for skill '${skillName}'`
      );
    }
  }

  /**
   * Get the output path for a skill file
   * Skills are stored in: .opencode/skill/{name}/SKILL.md
   */
  getSkillOutputPath(skillName: string): string {
    return join(OPENCODE_DIR, SKILLS_DIR, skillName, "SKILL.md");
  }

  /**
   * Customization zone markers for skill templates.
   * Content between these markers is preserved during regeneration.
   */
  private static readonly CUSTOM_START = "<!-- CUSTOM IMPLEMENTATION START -->";
  private static readonly CUSTOM_END = "<!-- CUSTOM IMPLEMENTATION END -->";

  /**
   * Generate a single skill file.
   * Preserves user customizations within the CUSTOM IMPLEMENTATION zone.
   */
  async generateSkillFile(config: SkillConfig): Promise<SkillGenerationResult> {
    const outputPath = this.getSkillOutputPath(config.name);

    try {
      // Ensure output directory exists (skills use subdirectories)
      const outputDir = dirname(outputPath);
      await mkdir(outputDir, { recursive: true });

      // Check if file already exists
      const exists = await this.fileManager.exists(outputPath);

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
    const startIndex = content.indexOf(SkillGenerator.CUSTOM_START);
    const endIndex = content.indexOf(SkillGenerator.CUSTOM_END);

    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
      return undefined;
    }

    const customContent = content.slice(
      startIndex + SkillGenerator.CUSTOM_START.length,
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
    const startIndex = rendered.indexOf(SkillGenerator.CUSTOM_START);
    const endIndex = rendered.indexOf(SkillGenerator.CUSTOM_END);

    if (startIndex === -1 || endIndex === -1) {
      return rendered;
    }

    const beforeCustom = rendered.slice(0, startIndex + SkillGenerator.CUSTOM_START.length);
    const afterCustom = rendered.slice(endIndex);

    return `${beforeCustom}\n${customContent}\n${afterCustom}`;
  }

  /**
   * Generate multiple skill files
   */
  async generateSkillFiles(
    configs: SkillConfig[]
  ): Promise<SkillGenerationResult[]> {
    const results: SkillGenerationResult[] = [];

    for (const config of configs) {
      const result = await this.generateSkillFile(config);
      results.push(result);
    }

    return results;
  }

  /**
   * Generate skill files and update manifest
   */
  async generateWithManifest(
    configs: SkillConfig[],
    projectPath: string
  ): Promise<{
    results: SkillGenerationResult[];
    manifest: CustomizationManifest;
  }> {
    // Load or create manifest
    let manifest = await loadManifest(projectPath);
    if (!manifest) {
      manifest = createManifest(PACKAGE_VERSION);
    }

    // Generate files
    const results = await this.generateSkillFiles(configs);

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
 * Factory function to create a SkillGenerator instance
 */
export function createSkillGenerator(
  options: SkillGenerationOptions
): SkillGenerator {
  return new SkillGenerator(options);
}

/**
 * Convenience function to generate all MVP skill files
 */
export async function generateMVPSkills(
  configs: SkillConfig[],
  projectPath: string,
  options?: Partial<SkillGenerationOptions>
): Promise<SkillGenerationResult[]> {
  const generator = createSkillGenerator({
    outputDir: projectPath,
    ...options,
  });

  const { results } = await generator.generateWithManifest(configs, projectPath);
  return results;
}
