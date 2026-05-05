import * as fs from "fs";
import * as path from "path";

/**
 * Write `content` to `filePath` atomically: serialise to a per-pid
 * tempfile in the same directory, then rename onto the target. The
 * rename is the atomic step on POSIX filesystems, so a crashed or
 * concurrent writer can never leave the destination half-written.
 *
 * This does NOT prevent lost updates between two writers — for that
 * we'd need a proper file lock. The goal here is the narrower
 * guarantee that readers always see a complete file.
 */
export function writeFileAtomic(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmp = path.join(dir, `.${base}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, filePath);
}
