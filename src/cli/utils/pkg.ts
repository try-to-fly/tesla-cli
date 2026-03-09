import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export type PackageMeta = {
  name?: string;
  version?: string;
  description?: string;
};

function findPackageJson(startDir: string): string | null {
  let dir = startDir;
  while (true) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function readPackageMeta(): PackageMeta {
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = findPackageJson(currentDir);
    if (!pkgPath) return {};
    return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as PackageMeta;
  } catch {
    return {};
  }
}
