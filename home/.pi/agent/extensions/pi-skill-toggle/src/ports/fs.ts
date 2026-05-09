import { constants } from "node:fs";
import fs from "node:fs/promises";
import { dirname, join } from "node:path";

export interface FileSystem {
  readFile(path: string): Promise<string>;
  writeFileAtomic(path: string, content: string): Promise<void>;
  access(path: string, mode?: number): Promise<boolean>;
  readdir(path: string): Promise<Array<{ name: string; isDirectory: boolean; isFile: boolean; isSymbolicLink: boolean }>>;
  stat(path: string): Promise<{ isDirectory: boolean; isFile: boolean; mode: number }>;
}

export class NodeFileSystem implements FileSystem {
  async readFile(path: string): Promise<string> {
    return fs.readFile(path, "utf8");
  }

  async writeFileAtomic(path: string, content: string): Promise<void> {
    const dir = dirname(path);
    const tmp = join(dir, `.pi-skill-toggle-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);
    let mode: number | undefined;
    try {
      mode = (await fs.stat(path)).mode;
    } catch {
      mode = undefined;
    }

    await fs.writeFile(tmp, content, "utf8");
    if (mode !== undefined) {
      await fs.chmod(tmp, mode);
    }
    await fs.rename(tmp, path);
  }

  async access(path: string, mode = constants.F_OK): Promise<boolean> {
    try {
      await fs.access(path, mode);
      return true;
    } catch {
      return false;
    }
  }

  async readdir(path: string): Promise<Array<{ name: string; isDirectory: boolean; isFile: boolean; isSymbolicLink: boolean }>> {
    const entries = await fs.readdir(path, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
      isSymbolicLink: entry.isSymbolicLink(),
    }));
  }

  async stat(path: string): Promise<{ isDirectory: boolean; isFile: boolean; mode: number }> {
    const stats = await fs.stat(path);
    return { isDirectory: stats.isDirectory(), isFile: stats.isFile(), mode: stats.mode };
  }
}
