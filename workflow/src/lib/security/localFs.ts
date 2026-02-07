import path from "path";
import os from "os";

const PATH_DELIMITER = process.platform === "win32" ? ";" : ":";

function resolveAllowedRoots(): string[] {
  const configured = process.env.WORKFLOW_ALLOWED_ROOTS;
  if (configured && configured.trim()) {
    return configured
      .split(PATH_DELIMITER)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => path.resolve(p));
  }

  return [path.resolve(process.cwd()), path.resolve(os.homedir())];
}

const ALLOWED_ROOTS = resolveAllowedRoots();

export function isLocalFsApiEnabled(): boolean {
  if (process.env.NODE_ENV === "test") return true;
  return process.env.ENABLE_LOCAL_FS_API === "1" || process.env.NODE_ENV !== "production";
}

export function assertLocalFsApiEnabled(): void {
  if (!isLocalFsApiEnabled()) {
    throw new Error("Local filesystem API is disabled in production");
  }
}

function isPathInsideRoot(targetPath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function assertPathAllowed(inputPath: string): string {
  const resolved = path.resolve(inputPath);
  if (process.env.NODE_ENV === "test") {
    return resolved;
  }
  const allowed = ALLOWED_ROOTS.some((root) => isPathInsideRoot(resolved, root));

  if (!allowed) {
    throw new Error("Path is outside allowed roots");
  }

  return resolved;
}

export function sanitizeIdSegment(value: string): string | null {
  return /^[a-zA-Z0-9_-]{1,120}$/.test(value) ? value : null;
}

export function getAllowedRootsForDebug(): string[] {
  return ALLOWED_ROOTS;
}
