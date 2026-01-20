import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  computeHash,
  type FileEntry,
  type MarkdownFileEntry,
} from "./manifest.js";
import { OPENCODE_DIR, AGENTS_DIR, AGENTS_MD_FILE, OPENCODE_JSON_FILE } from "./constants.js";

/**
 * Conflict types that can occur during merge
 */
export type ConflictType = "structural" | "content" | "section";

/**
 * Represents a merge conflict
 */
export interface Conflict {
  file: string;
  type: ConflictType;
  description: string;
  userContent: string;
  newTemplate: string;
  conflictingSections?: string[];
}

/**
 * Result of a merge operation
 */
export interface MergeResult {
  file: string;
  action: "updated" | "preserved" | "merged" | "conflict";
  conflict?: Conflict;
  details?: string;
}

/**
 * Markdown section with content
 */
export interface MarkdownSection {
  header: string;
  level: number;
  content: string;
  startLine: number;
  endLine: number;
}

/**
 * Parse markdown content into sections
 */
export function parseMarkdownSections(content: string): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  const lines = content.split("\n");

  let currentSection: MarkdownSection | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headerMatch && headerMatch[1] && headerMatch[2]) {
      // Close previous section
      if (currentSection) {
        currentSection.endLine = i - 1;
        currentSection.content = lines
          .slice(currentSection.startLine + 1, i)
          .join("\n")
          .trim();
        sections.push(currentSection);
      }

      // Start new section
      currentSection = {
        header: headerMatch[2].trim(),
        level: headerMatch[1].length,
        content: "",
        startLine: i,
        endLine: i,
      };
    }
  }

  // Close final section
  if (currentSection) {
    currentSection.endLine = lines.length - 1;
    currentSection.content = lines
      .slice(currentSection.startLine + 1)
      .join("\n")
      .trim();
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Detect user-added sections in markdown
 */
export function detectUserSections(
  currentSections: MarkdownSection[],
  templateSections: MarkdownSection[]
): string[] {
  const templateHeaders = new Set(templateSections.map(s => s.header.toLowerCase()));
  return currentSections
    .filter(s => !templateHeaders.has(s.header.toLowerCase()))
    .map(s => s.header);
}

/**
 * Detect modified sections in markdown (same header, different content)
 */
export function detectModifiedSections(
  currentSections: MarkdownSection[],
  templateSections: MarkdownSection[]
): string[] {
  const modified: string[] = [];

  for (const current of currentSections) {
    const template = templateSections.find(
      s => s.header.toLowerCase() === current.header.toLowerCase()
    );

    if (template) {
      const currentHash = computeHash(current.content);
      const templateHash = computeHash(template.content);

      if (currentHash !== templateHash) {
        modified.push(current.header);
      }
    }
  }

  return modified;
}

/**
 * Attempt structural merge of markdown files
 * Preserves user sections and merges template updates for unmodified sections
 */
export function structuralMergeMarkdown(
  currentContent: string,
  newTemplateContent: string,
  originalTemplateContent?: string
): { success: boolean; result?: string; conflicts?: string[] } {
  const currentSections = parseMarkdownSections(currentContent);
  const newTemplateSections = parseMarkdownSections(newTemplateContent);
  const originalSections = originalTemplateContent
    ? parseMarkdownSections(originalTemplateContent)
    : newTemplateSections;

  const userAddedSections = detectUserSections(currentSections, originalSections);
  const modifiedSections = detectModifiedSections(currentSections, originalSections);

  const conflicts: string[] = [];

  // Build merged content
  const mergedSections: MarkdownSection[] = [];
  const processedHeaders = new Set<string>();

  // First, add all new template sections
  for (const newSection of newTemplateSections) {
    const headerLower = newSection.header.toLowerCase();
    processedHeaders.add(headerLower);

    const currentSection = currentSections.find(
      s => s.header.toLowerCase() === headerLower
    );
    const originalSection = originalSections.find(
      s => s.header.toLowerCase() === headerLower
    );

    if (!currentSection) {
      // New section from template, add it
      mergedSections.push(newSection);
    } else if (modifiedSections.includes(currentSection.header)) {
      // User modified this section
      const originalHash = originalSection ? computeHash(originalSection.content) : "";
      const newHash = computeHash(newSection.content);

      if (originalHash !== newHash) {
        // Template also changed - conflict!
        conflicts.push(currentSection.header);
        // Keep user version for now (will be resolved interactively)
        mergedSections.push(currentSection);
      } else {
        // Template didn't change, keep user modification
        mergedSections.push(currentSection);
      }
    } else {
      // User didn't modify, use new template version
      mergedSections.push(newSection);
    }
  }

  // Add user-added sections at the end
  for (const header of userAddedSections) {
    const section = currentSections.find(s => s.header === header);
    if (section) {
      mergedSections.push(section);
    }
  }

  // Render merged markdown
  const result = renderMarkdownSections(mergedSections);

  if (conflicts.length > 0) {
    return {
      success: false,
      result,
      conflicts,
    };
  }

  return {
    success: true,
    result,
  };
}

/**
 * Render markdown sections back to string
 */
function renderMarkdownSections(sections: MarkdownSection[]): string {
  return sections
    .map(section => {
      const prefix = "#".repeat(section.level);
      return `${prefix} ${section.header}\n\n${section.content}`;
    })
    .join("\n\n");
}

/**
 * Deep merge two objects
 * User values take precedence, arrays are concatenated (deduplicated)
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>,
  preserveUserArrays = true
): T {
  const result = { ...target };

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (sourceValue === undefined) {
      continue;
    }

    if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
      if (preserveUserArrays) {
        // Merge arrays, keeping unique values
        const merged = [...targetValue];
        for (const item of sourceValue) {
          if (!merged.includes(item)) {
            merged.push(item);
          }
        }
        (result as Record<string, unknown>)[key as string] = merged;
      } else {
        (result as Record<string, unknown>)[key as string] = sourceValue;
      }
    } else if (
      typeof sourceValue === "object" &&
      sourceValue !== null &&
      typeof targetValue === "object" &&
      targetValue !== null &&
      !Array.isArray(sourceValue)
    ) {
      // Recursively merge objects
      (result as Record<string, unknown>)[key as string] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>,
        preserveUserArrays
      );
    } else {
      // Primitive value - keep user value (target)
      // Only update if target doesn't have this key
      if (!(key in target)) {
        (result as Record<string, unknown>)[key as string] = sourceValue;
      }
    }
  }

  return result;
}

/**
 * Merge opencode.json configuration
 * Preserves user customizations while adding new template keys
 */
export async function mergeConfig(
  projectPath: string,
  newTemplateConfig: Record<string, unknown>
): Promise<MergeResult> {
  const configPath = join(projectPath, OPENCODE_JSON_FILE);

  try {
    const currentContent = await readFile(configPath, "utf-8");
    const currentConfig = JSON.parse(currentContent) as Record<string, unknown>;

    // Merge with user config taking precedence
    const merged = deepMerge(currentConfig, newTemplateConfig, true);

    // Only write if there are changes
    const currentHash = computeHash(JSON.stringify(currentConfig, null, 2));
    const mergedHash = computeHash(JSON.stringify(merged, null, 2));

    if (currentHash !== mergedHash) {
      await writeFile(configPath, JSON.stringify(merged, null, 2), "utf-8");
      return {
        file: OPENCODE_JSON_FILE,
        action: "merged",
        details: "Configuration merged with new template keys",
      };
    }

    return {
      file: OPENCODE_JSON_FILE,
      action: "preserved",
      details: "No changes needed",
    };
  } catch {
    // Config doesn't exist, create it
    await writeFile(configPath, JSON.stringify(newTemplateConfig, null, 2), "utf-8");
    return {
      file: OPENCODE_JSON_FILE,
      action: "updated",
      details: "Configuration file created",
    };
  }
}

/**
 * Merge AGENTS.md with structural detection
 */
export async function mergeAgentsMd(
  projectPath: string,
  newTemplateContent: string,
  manifestEntry?: MarkdownFileEntry
): Promise<MergeResult> {
  const filePath = join(projectPath, AGENTS_MD_FILE);

  try {
    const currentContent = await readFile(filePath, "utf-8");

    // Get original template content from manifest for accurate diff
    const originalTemplate = manifestEntry
      ? await getOriginalTemplateContent(manifestEntry)
      : newTemplateContent;

    const mergeResult = structuralMergeMarkdown(
      currentContent,
      newTemplateContent,
      originalTemplate
    );

    if (mergeResult.success && mergeResult.result) {
      // Check if content actually changed
      const currentHash = computeHash(currentContent);
      const resultHash = computeHash(mergeResult.result);

      if (currentHash !== resultHash) {
        await writeFile(filePath, mergeResult.result, "utf-8");
        return {
          file: AGENTS_MD_FILE,
          action: "merged",
          details: "Structural merge successful",
        };
      }

      return {
        file: AGENTS_MD_FILE,
        action: "preserved",
        details: "No changes needed",
      };
    }

    // Merge conflict
    const conflict: Conflict = {
      file: AGENTS_MD_FILE,
      type: "structural",
      description: "User modified sections that also changed in template",
      userContent: currentContent,
      newTemplate: newTemplateContent,
    };
    if (mergeResult.conflicts) {
      conflict.conflictingSections = mergeResult.conflicts;
    }
    return {
      file: AGENTS_MD_FILE,
      action: "conflict",
      conflict,
    };
  } catch {
    // File doesn't exist, create it
    await writeFile(filePath, newTemplateContent, "utf-8");
    return {
      file: AGENTS_MD_FILE,
      action: "updated",
      details: "File created from template",
    };
  }
}

/**
 * Merge agent file (hash-based detection)
 */
export async function mergeAgentFile(
  projectPath: string,
  agentFileName: string,
  newTemplateContent: string,
  manifestEntry?: FileEntry
): Promise<MergeResult> {
  const filePath = join(projectPath, OPENCODE_DIR, AGENTS_DIR, agentFileName);

  try {
    const currentContent = await readFile(filePath, "utf-8");
    const currentHash = computeHash(currentContent);
    const newTemplateHash = computeHash(newTemplateContent);

    // If user hasn't modified the file, update it
    if (manifestEntry) {
      if (currentHash === manifestEntry.templateHash) {
        // File unmodified, safe to update
        if (newTemplateHash !== manifestEntry.templateHash) {
          await writeFile(filePath, newTemplateContent, "utf-8");
          return {
            file: agentFileName,
            action: "updated",
            details: "Updated to new template version",
          };
        }
        return {
          file: agentFileName,
          action: "preserved",
          details: "No template changes",
        };
      }

      // User modified the file
      if (newTemplateHash === manifestEntry.templateHash) {
        // Template hasn't changed, keep user modifications
        return {
          file: agentFileName,
          action: "preserved",
          details: "User modifications preserved",
        };
      }

      // Both modified - conflict
      return {
        file: agentFileName,
        action: "conflict",
        conflict: {
          file: agentFileName,
          type: "content",
          description: "File was modified by user and template changed",
          userContent: currentContent,
          newTemplate: newTemplateContent,
        },
      };
    }

    // No manifest entry - assume user modified if content differs from new template
    if (currentHash !== newTemplateHash) {
      return {
        file: agentFileName,
        action: "conflict",
        conflict: {
          file: agentFileName,
          type: "content",
          description: "File differs from template (no history available)",
          userContent: currentContent,
          newTemplate: newTemplateContent,
        },
      };
    }

    return {
      file: agentFileName,
      action: "preserved",
      details: "Content matches template",
    };
  } catch {
    // File doesn't exist, create it
    await writeFile(filePath, newTemplateContent, "utf-8");
    return {
      file: agentFileName,
      action: "updated",
      details: "File created from template",
    };
  }
}

/**
 * Get original template content from manifest
 * (Placeholder - would need template version tracking in real implementation)
 */
async function getOriginalTemplateContent(_entry: MarkdownFileEntry): Promise<string> {
  // In a real implementation, this would fetch the original template
  // from the package at the version recorded in the manifest
  // For now, we can't reconstruct the original, so we return empty
  return "";
}

/**
 * List all agent files in the .opencode/agent directory
 */
export async function listAgentFiles(projectPath: string): Promise<string[]> {
  const agentDir = join(projectPath, OPENCODE_DIR, AGENTS_DIR);

  try {
    const entries = await readdir(agentDir, { withFileTypes: true });
    return entries
      .filter(e => e.isFile() && e.name.endsWith(".md"))
      .map(e => e.name);
  } catch {
    return [];
  }
}
