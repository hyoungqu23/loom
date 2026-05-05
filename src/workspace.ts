import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

let activeWorkspace: string = process.cwd();

export function getPackageRoot(): string {
  return PACKAGE_ROOT;
}

export function getActiveWorkspace(): string {
  return activeWorkspace;
}

export function setActiveWorkspace(workspace: string): void {
  activeWorkspace = path.resolve(workspace);
}

export function workspaceRoot(): string {
  return path.resolve(activeWorkspace || process.cwd());
}

export function loomStateRoot(): string {
  return path.join(workspaceRoot(), ".loom");
}

export function workspaceConfigPath(): string {
  return path.join(loomStateRoot(), "config.json");
}

export function ensureWorkspaceState(): string {
  const root = loomStateRoot();
  fs.mkdirSync(path.join(root, "features"), { recursive: true });
  fs.mkdirSync(path.join(root, "runtime-runs"), { recursive: true });
  return root;
}

export function packageHarnessPath(...parts: string[]): string {
  return path.join(PACKAGE_ROOT, "harness", ...parts);
}

export function readPackageHarnessFile(...parts: string[]): string {
  const filePath = packageHarnessPath(...parts);
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

export function defaultsPath(): string {
  return path.join(PACKAGE_ROOT, "config", "defaults.json");
}

/**
 * Resolve `userPath` and ensure the result stays inside the active workspace
 * root (or, when `allowPackageRoot` is set, also inside the Loom package
 * directory). Throws on escape attempts so user-supplied paths can't be used
 * to read or write arbitrary locations on disk.
 *
 * `label` is included in the error message to help the user identify which
 * flag was rejected, e.g. `ensureWithinWorkspace(p, "--target")`.
 */
export function ensureWithinWorkspace(
  userPath: string,
  label = "path",
  options: { allowPackageRoot?: boolean } = {},
): string {
  const abs = path.resolve(userPath);
  const allowed: string[] = [workspaceRoot()];
  if (options.allowPackageRoot) allowed.push(PACKAGE_ROOT);

  for (const root of allowed) {
    if (abs === root) return abs;
    if (abs.startsWith(root + path.sep)) return abs;
  }

  throw new Error(
    `${label} escapes workspace: ${userPath}\n  resolved: ${abs}\n  workspace: ${workspaceRoot()}`,
  );
}
