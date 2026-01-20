import { readFile, writeFile, mkdir, access, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

export class FileManager {
  constructor(private readonly basePath: string) {}

  async exists(relativePath: string): Promise<boolean> {
    try {
      await access(join(this.basePath, relativePath));
      return true;
    } catch {
      return false;
    }
  }

  async read(relativePath: string): Promise<string> {
    return readFile(join(this.basePath, relativePath), "utf-8");
  }

  async write(relativePath: string, content: string): Promise<void> {
    const fullPath = join(this.basePath, relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf-8");
  }

  async remove(relativePath: string): Promise<void> {
    await rm(join(this.basePath, relativePath), { force: true, recursive: true });
  }

  async ensureDir(relativePath: string): Promise<void> {
    await mkdir(join(this.basePath, relativePath), { recursive: true });
  }
}
