import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Customization Manifest
 * Tracks file hashes and customizations to enable smart merging during updates.
 */

export interface FileEntry {
  /** File path relative to project root */
  path: string;
  /** SHA-256 hash of original template content */
  templateHash: string;
  /** SHA-256 hash of current file content */
  currentHash: string;
  /** Whether the file has been modified from template */
  modified: boolean;
  /** Timestamp when file was first created */
  createdAt: string;
  /** Timestamp when file was last checked */
  lastChecked: string;
}

export interface SectionEntry {
  /** Section header (e.g., "## Workflow Rules") */
  header: string;
  /** SHA-256 hash of section content */
  hash: string;
  /** Whether this is a user-added section (not in template) */
  userAdded: boolean;
}

export interface MarkdownFileEntry extends FileEntry {
  /** Tracked sections within the markdown file */
  sections: SectionEntry[];
}

export interface CustomizationManifest {
  /** Manifest format version */
  version: string;
  /** Package version when manifest was created */
  packageVersion: string;
  /** Timestamp when manifest was created */
  createdAt: string;
  /** Timestamp when manifest was last updated */
  updatedAt: string;
  /** Tracked files */
  files: Record<string, FileEntry | MarkdownFileEntry>;
}

const MANIFEST_VERSION = "1.0.0";
const MANIFEST_FILENAME = ".atreides-manifest.json";

/**
 * Compute SHA-256 hash of content
 */
export function computeHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex").slice(0, 16);
}

/**
 * Check if a file entry is a markdown file entry with sections
 */
export function isMarkdownFileEntry(entry: FileEntry): entry is MarkdownFileEntry {
  return "sections" in entry && Array.isArray((entry as MarkdownFileEntry).sections);
}

/**
 * Create a new empty manifest
 */
export function createManifest(packageVersion: string): CustomizationManifest {
  const now = new Date().toISOString();
  return {
    version: MANIFEST_VERSION,
    packageVersion,
    createdAt: now,
    updatedAt: now,
    files: {},
  };
}

/**
 * Create a file entry for tracking
 */
export function createFileEntry(
  path: string,
  templateContent: string,
  currentContent: string
): FileEntry {
  const templateHash = computeHash(templateContent);
  const currentHash = computeHash(currentContent);
  const now = new Date().toISOString();

  return {
    path,
    templateHash,
    currentHash,
    modified: templateHash !== currentHash,
    createdAt: now,
    lastChecked: now,
  };
}

/**
 * Create a markdown file entry with section tracking
 */
export function createMarkdownFileEntry(
  path: string,
  templateContent: string,
  currentContent: string,
  templateSections: SectionEntry[],
  currentSections: SectionEntry[]
): MarkdownFileEntry {
  const base = createFileEntry(path, templateContent, currentContent);

  // Identify user-added sections (in current but not in template)
  const templateHeaders = new Set(templateSections.map(s => s.header));
  const sections = currentSections.map(section => ({
    ...section,
    userAdded: !templateHeaders.has(section.header),
  }));

  return {
    ...base,
    sections,
  };
}

/**
 * Extract sections from markdown content
 */
export function extractMarkdownSections(content: string): SectionEntry[] {
  const sections: SectionEntry[] = [];
  const lines = content.split("\n");

  let currentHeader: string | null = null;
  let currentContent: string[] = [];

  const flushSection = () => {
    if (currentHeader !== null) {
      const sectionContent = currentContent.join("\n").trim();
      sections.push({
        header: currentHeader,
        hash: computeHash(sectionContent),
        userAdded: false, // Will be set by createMarkdownFileEntry
      });
    }
  };

  for (const line of lines) {
    // Match markdown headers (## Header or # Header)
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headerMatch) {
      flushSection();
      currentHeader = `${headerMatch[1]} ${headerMatch[2]}`;
      currentContent = [];
    } else if (currentHeader !== null) {
      currentContent.push(line);
    }
  }

  // Flush the last section
  flushSection();

  return sections;
}

/**
 * Load manifest from project directory
 */
export async function loadManifest(projectPath: string): Promise<CustomizationManifest | null> {
  const manifestPath = join(projectPath, MANIFEST_FILENAME);

  try {
    const content = await readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(content) as CustomizationManifest;

    // Validate manifest version
    if (!manifest.version || !manifest.files) {
      return null;
    }

    return manifest;
  } catch {
    return null;
  }
}

/**
 * Save manifest to project directory
 */
export async function saveManifest(
  projectPath: string,
  manifest: CustomizationManifest
): Promise<void> {
  const manifestPath = join(projectPath, MANIFEST_FILENAME);
  manifest.updatedAt = new Date().toISOString();

  const content = JSON.stringify(manifest, null, 2);
  await writeFile(manifestPath, content, "utf-8");
}

/**
 * Update a file entry in the manifest
 */
export function updateFileEntry(
  manifest: CustomizationManifest,
  path: string,
  entry: FileEntry | MarkdownFileEntry
): void {
  manifest.files[path] = entry;
  manifest.updatedAt = new Date().toISOString();
}

/**
 * Check if a file has been modified from template
 */
export async function isFileModified(
  projectPath: string,
  relativePath: string,
  manifest: CustomizationManifest | null
): Promise<{ modified: boolean; currentHash: string; templateHash: string | null }> {
  const filePath = join(projectPath, relativePath);

  try {
    const content = await readFile(filePath, "utf-8");
    const currentHash = computeHash(content);

    if (manifest?.files[relativePath]) {
      const entry = manifest.files[relativePath];
      return {
        modified: currentHash !== entry.templateHash,
        currentHash,
        templateHash: entry.templateHash,
      };
    }

    return {
      modified: true, // Assume modified if no manifest entry
      currentHash,
      templateHash: null,
    };
  } catch {
    return {
      modified: false,
      currentHash: "",
      templateHash: null,
    };
  }
}

/**
 * Detect changes between current file and new template
 */
export interface ChangeDetectionResult {
  /** File was modified by user from original template */
  userModified: boolean;
  /** New template differs from original template */
  templateChanged: boolean;
  /** Conflict exists (both user modified and template changed) */
  hasConflict: boolean;
  /** User-added sections (for markdown files) */
  userAddedSections: string[];
  /** Modified sections (for markdown files) */
  modifiedSections: string[];
}

export function detectChanges(
  currentContent: string,
  newTemplateContent: string,
  manifestEntry: FileEntry | null
): ChangeDetectionResult {
  const currentHash = computeHash(currentContent);
  const newTemplateHash = computeHash(newTemplateContent);

  // If no manifest entry, assume user modified
  if (!manifestEntry) {
    return {
      userModified: true,
      templateChanged: true,
      hasConflict: true,
      userAddedSections: [],
      modifiedSections: [],
    };
  }

  const userModified = currentHash !== manifestEntry.templateHash;
  const templateChanged = newTemplateHash !== manifestEntry.templateHash;

  return {
    userModified,
    templateChanged,
    hasConflict: userModified && templateChanged,
    userAddedSections: [],
    modifiedSections: [],
  };
}

/**
 * Detect changes in markdown file with section-level granularity
 */
export function detectMarkdownChanges(
  currentContent: string,
  newTemplateContent: string,
  manifestEntry: MarkdownFileEntry | null
): ChangeDetectionResult {
  const currentSections = extractMarkdownSections(currentContent);
  const newTemplateSections = extractMarkdownSections(newTemplateContent);

  // Get template section headers
  const templateHeaders = new Set(
    manifestEntry?.sections
      .filter(s => !s.userAdded)
      .map(s => s.header) ?? []
  );
  const newTemplateHeaders = new Set(newTemplateSections.map(s => s.header));

  // Find user-added sections (not in original template)
  const userAddedSections = currentSections
    .filter(s => !templateHeaders.has(s.header) && !newTemplateHeaders.has(s.header))
    .map(s => s.header);

  // Find modified sections (same header, different content)
  const modifiedSections: string[] = [];

  if (manifestEntry) {
    for (const currentSection of currentSections) {
      const originalSection = manifestEntry.sections.find(
        s => s.header === currentSection.header
      );

      if (originalSection && originalSection.hash !== currentSection.hash) {
        // Check if new template also changed this section
        const newSection = newTemplateSections.find(s => s.header === currentSection.header);

        if (newSection && newSection.hash !== originalSection.hash) {
          // Both user and template modified the same section
          modifiedSections.push(currentSection.header);
        }
      }
    }
  }

  const baseResult = detectChanges(
    currentContent,
    newTemplateContent,
    manifestEntry
  );

  return {
    ...baseResult,
    userAddedSections,
    modifiedSections,
    hasConflict: baseResult.hasConflict || modifiedSections.length > 0,
  };
}
