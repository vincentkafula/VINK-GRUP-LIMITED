import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
import type { JournalIo } from "./runtime/journalStore";

/** A JournalIo on a normal file system: appends are fsync'd, and the journal is replaced by writing a temporary file and renaming it over the old one. */
export function fileJournalIo(path: string): JournalIo {
  return {
    async load() { return existsSync(path) ? readFileSync(path, "utf8").split("\n") : []; },
    async append(lines) { const fd = openSync(path, "a"); try { writeSync(fd, lines.join("\n") + "\n"); fsyncSync(fd); } finally { closeSync(fd); } },
    async replace(line) { const tmp = path + ".tmp"; const fd = openSync(tmp, "w"); try { writeSync(fd, line + "\n"); fsyncSync(fd); } finally { closeSync(fd); } renameSync(tmp, path); },
  };
}
