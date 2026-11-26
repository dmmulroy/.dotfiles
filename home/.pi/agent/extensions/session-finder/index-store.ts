// SQLite index of every session on the device. Runs inside the index worker
// (worker.ts); erasable TypeScript only, no pi imports.
//
// Layout:
//   session_files  one row per .jsonl: byte offset indexed so far, header metadata
//   session_docs   one row per searchable part: where its line lives in the file
//   session_fts    contentless trigram FTS5 (detail=none) over the part text
//
// The text itself is not stored: previews and match verification re-read the
// line from the session file by byte offset. Pi only appends to session files,
// so a file is indexed incrementally from its stored offset. A file that shrank
// or changed inode is re-indexed from the start.

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { extractSessionDocParts, sessionEntryTime, type RawSessionEntry, type SessionDocKind, type SessionDocPart } from "./extract.ts";
import {
  buildTrigramMatch,
  findTermRanges,
  parseSessionSearchQuery,
  rawLineMayMatch,
  snippetAround,
  type MatchRange,
} from "./query.ts";

const SCHEMA_VERSION = 1;

export interface SessionSearchHit {
  docId: number;
  sessionPath: string;
  sessionId: string;
  sessionTitle: string;
  cwd: string;
  entryId: string;
  part: number;
  kind: SessionDocKind;
  tool?: string;
  toolCallId?: string;
  ts: number;
  snippet: string;
  snippetRanges: MatchRange[];
}

export interface SessionSearchRequest {
  query: string;
  roleFilter: SessionDocKind[];
  limit: number;
}

export interface SessionSearchResponse {
  hits: SessionSearchHit[];
  /** Candidates the FTS index returned before verification (capped). */
  candidates: number;
  /** True when the candidate cap or time budget cut verification short. */
  truncated: boolean;
}

export interface SessionDocPreview {
  text: string;
  ranges: MatchRange[];
  /** Neighbouring parts in the same session, oldest first, for context. */
  before: Array<{ kind: SessionDocKind; tool?: string; text: string }>;
  after: Array<{ kind: SessionDocKind; tool?: string; text: string }>;
}

export interface IndexProgress {
  phase: "scanning" | "indexing" | "idle";
  filesDone: number;
  filesTotal: number;
  docs: number;
}

interface FileRow {
  id: number;
  path: string;
  inode: string;
  size: number;
  mtime_ms: number;
  indexed_offset: number;
  session_id: string;
  cwd: string;
  name: string;
  title: string;
}

interface DocRow {
  id: number;
  file_id: number;
  entry_id: string;
  part: number;
  kind: SessionDocKind;
  tool: string | null;
  tool_call_id: string | null;
  ts: number;
  line_offset: number;
  line_length: number;
  path: string;
  session_id: string;
  cwd: string;
  name: string;
  title: string;
}

const CHUNK_BYTES = 8 * 1024 * 1024;
const NEWLINE = 0x0a;

function listSessionFiles(sessionsDir: string): string[] {
  const files: string[] = [];
  let projectDirs: fs.Dirent[];
  try {
    projectDirs = fs.readdirSync(sessionsDir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const dir of projectDirs) {
    if (!dir.isDirectory()) continue;
    const dirPath = path.join(sessionsDir, dir.name);
    let names: string[];
    try {
      names = fs.readdirSync(dirPath);
    } catch {
      continue;
    }
    for (const name of names) if (name.endsWith(".jsonl")) files.push(path.join(dirPath, name));
  }
  return files;
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function firstLine(text: string, max = 200): string {
  const line = text.trim().split("\n", 1)[0] ?? "";
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

export class SessionIndexStore {
  private readonly db: DatabaseSync;
  private readonly insertDoc: StatementSync;
  private readonly insertFts: StatementSync;
  private readonly sessionsDir: string;
  private readonly onProgress: (progress: IndexProgress) => void;
  private indexing = false;
  private rescanRequested = false;
  progress: IndexProgress = { phase: "idle", filesDone: 0, filesTotal: 0, docs: 0 };

  constructor(dbPath: string, sessionsDir: string, onProgress: (progress: IndexProgress) => void) {
    this.sessionsDir = sessionsDir;
    this.onProgress = onProgress;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA temp_store=MEMORY; PRAGMA cache_size=-65536;");
    this.migrate();
    this.insertDoc = this.db.prepare(
      `INSERT INTO session_docs (file_id, entry_id, part, kind, tool, tool_call_id, ts, line_offset, line_length)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.insertFts = this.db.prepare("INSERT INTO session_fts (rowid, text) VALUES (?, ?)");
    this.progress.docs = this.countDocs();
  }

  private migrate(): void {
    const row = this.db.prepare("PRAGMA user_version").get() as { user_version: number };
    if (row.user_version === SCHEMA_VERSION) return;
    this.db.exec(`
      DROP TABLE IF EXISTS session_files;
      DROP TABLE IF EXISTS session_docs;
      DROP TABLE IF EXISTS session_fts;
      CREATE TABLE session_files (
        id INTEGER PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        inode TEXT NOT NULL,
        size INTEGER NOT NULL,
        mtime_ms REAL NOT NULL,
        indexed_offset INTEGER NOT NULL,
        session_id TEXT NOT NULL DEFAULT '',
        cwd TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT ''
      );
      -- AUTOINCREMENT: ids are never reused, so stale rows left in the contentless FTS
      -- after a re-index can never join to a new doc.
      CREATE TABLE session_docs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER NOT NULL,
        entry_id TEXT NOT NULL,
        part INTEGER NOT NULL,
        kind TEXT NOT NULL,
        tool TEXT,
        tool_call_id TEXT,
        ts INTEGER NOT NULL,
        line_offset INTEGER NOT NULL,
        line_length INTEGER NOT NULL
      );
      CREATE INDEX session_docs_file ON session_docs(file_id, id);
      CREATE INDEX session_docs_ts ON session_docs(ts);
      CREATE VIRTUAL TABLE session_fts USING fts5(text, content='', tokenize='trigram', detail='none');
      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
  }

  private countDocs(): number {
    return (this.db.prepare("SELECT count(*) AS n FROM session_docs").get() as { n: number }).n;
  }

  close(): void {
    this.db.close();
  }

  /** Bring the index up to date with the session files. Re-runs once if asked while running. */
  async refresh(): Promise<void> {
    if (this.indexing) {
      this.rescanRequested = true;
      return;
    }
    this.indexing = true;
    try {
      do {
        this.rescanRequested = false;
        await this.refreshOnce();
      } while (this.rescanRequested);
    } finally {
      this.indexing = false;
      this.progress = { ...this.progress, phase: "idle" };
      this.onProgress(this.progress);
    }
  }

  private async refreshOnce(): Promise<void> {
    this.progress = { phase: "scanning", filesDone: 0, filesTotal: 0, docs: this.progress.docs };
    this.onProgress(this.progress);
    const known = new Map<string, FileRow>();
    for (const row of this.db.prepare("SELECT * FROM session_files").all() as unknown as FileRow[]) known.set(row.path, row);

    const work: Array<{ filePath: string; stat: fs.Stats; row: FileRow | undefined }> = [];
    const seen = new Set<string>();
    for (const filePath of listSessionFiles(this.sessionsDir)) {
      seen.add(filePath);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(filePath);
      } catch {
        continue;
      }
      const row = known.get(filePath);
      if (row && row.inode === String(stat.ino) && row.size === stat.size && row.indexed_offset <= stat.size && row.mtime_ms === stat.mtimeMs) continue;
      work.push({ filePath, stat, row });
    }
    for (const [filePath, row] of known) {
      if (!seen.has(filePath)) this.deleteFile(row.id);
    }
    // Oldest first, so doc ids roughly follow time and "newest first" is cheap.
    work.sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs);

    this.progress = { phase: "indexing", filesDone: 0, filesTotal: work.length, docs: this.progress.docs };
    this.onProgress(this.progress);
    let lastReport = Date.now();
    for (const item of work) {
      try {
        this.indexFile(item.filePath, item.stat, item.row);
      } catch {
        // A file that fails to read is retried on the next refresh.
      }
      this.progress.filesDone += 1;
      if (Date.now() - lastReport > 250) {
        lastReport = Date.now();
        this.progress.docs = this.countDocs();
        this.onProgress({ ...this.progress });
      }
      // Let queued search requests run between files.
      await yieldToEventLoop();
    }
    this.progress.docs = this.countDocs();
  }

  private deleteFile(fileId: number): void {
    // Stale FTS rows stay behind (contentless tables cannot delete by rowid without the text);
    // they no longer join to a doc, so searches skip them.
    this.db.prepare("DELETE FROM session_docs WHERE file_id = ?").run(fileId);
    this.db.prepare("DELETE FROM session_files WHERE id = ?").run(fileId);
  }

  private indexFile(filePath: string, stat: fs.Stats, _staleRow: FileRow | undefined): void {
    // Several pi processes may index at once. BEGIN IMMEDIATE takes the write lock, then
    // the file row is re-read so a file another process just indexed is not indexed twice.
    this.db.exec("BEGIN IMMEDIATE");
    let committed = false;
    try {
      this.indexFileLocked(filePath, stat);
      this.db.exec("COMMIT");
      committed = true;
    } finally {
      if (!committed) this.db.exec("ROLLBACK");
    }
  }

  private indexFileLocked(filePath: string, stat: fs.Stats): void {
    let row = this.db.prepare("SELECT * FROM session_files WHERE path = ?").get(filePath) as unknown as FileRow | undefined;
    const inode = String(stat.ino);
    if (row && (row.inode !== inode || stat.size < row.indexed_offset)) {
      this.deleteFile(row.id);
      row = undefined;
    }
    if (row && row.indexed_offset === stat.size) {
      this.db.prepare("UPDATE session_files SET size = ?, mtime_ms = ? WHERE id = ?").run(stat.size, stat.mtimeMs, row.id);
      return;
    }
    if (!row) {
      const result = this.db
        .prepare("INSERT INTO session_files (path, inode, size, mtime_ms, indexed_offset) VALUES (?, ?, 0, 0, 0)")
        .run(filePath, inode);
      row = {
        id: Number(result.lastInsertRowid),
        path: filePath,
        inode,
        size: 0,
        mtime_ms: 0,
        indexed_offset: 0,
        session_id: "",
        cwd: "",
        name: "",
        title: "",
      };
    }

    const fd = fs.openSync(filePath, "r");
    let offset = row.indexed_offset;
    const meta = { sessionId: row.session_id, cwd: row.cwd, name: row.name, title: row.title };
    try {
      let carry = Buffer.alloc(0);
      let carryOffset = offset;
      let readPos = offset;
      while (readPos < stat.size) {
        const length = Math.min(CHUNK_BYTES, stat.size - readPos);
        const chunk = Buffer.allocUnsafe(length);
        const bytesRead = fs.readSync(fd, chunk, 0, length, readPos);
        if (bytesRead <= 0) break;
        readPos += bytesRead;
        const buffer = carry.length > 0 ? Buffer.concat([carry, chunk.subarray(0, bytesRead)]) : chunk.subarray(0, bytesRead);
        const bufferStart = carryOffset;
        let lineStart = 0;
        let newline = buffer.indexOf(NEWLINE, lineStart);
        while (newline >= 0) {
          this.indexLine(row.id, buffer.subarray(lineStart, newline), bufferStart + lineStart, meta);
          lineStart = newline + 1;
          newline = buffer.indexOf(NEWLINE, lineStart);
        }
        carry = Buffer.from(buffer.subarray(lineStart));
        carryOffset = bufferStart + lineStart;
        offset = carryOffset;
      }
      // A trailing line without a newline may still be written; index it on the next refresh.
      this.db
        .prepare(
          "UPDATE session_files SET size = ?, mtime_ms = ?, indexed_offset = ?, session_id = ?, cwd = ?, name = ?, title = ? WHERE id = ?",
        )
        .run(stat.size, stat.mtimeMs, offset, meta.sessionId, meta.cwd, meta.name, meta.title, row.id);
    } finally {
      fs.closeSync(fd);
    }
  }

  private indexLine(
    fileId: number,
    line: Buffer,
    lineOffset: number,
    meta: { sessionId: string; cwd: string; name: string; title: string },
  ): void {
    if (line.length === 0) return;
    // Cheap prefix test before parsing: entries start with {"type":"...".
    const head = line.subarray(0, 40).toString("latin1");
    const isMessage = head.includes('"type":"message"');
    const isHeader = head.includes('"type":"session"');
    const isInfo = head.includes('"type":"session_info"');
    if (!isMessage && !isHeader && !isInfo) {
      // Keys may be ordered differently in old files; fall back to a full scan of the head.
      if (!line.subarray(0, 200).toString("latin1").includes('"type":"message"')) return;
    }
    let entry: RawSessionEntry & { cwd?: string; name?: string };
    try {
      entry = JSON.parse(line.toString("utf8"));
    } catch {
      return;
    }
    if (entry.type === "session") {
      if (typeof entry.id === "string") meta.sessionId = entry.id;
      if (typeof entry.cwd === "string") meta.cwd = entry.cwd;
      return;
    }
    if (entry.type === "session_info") {
      meta.name = typeof entry.name === "string" ? entry.name : "";
      return;
    }
    if (typeof entry.id !== "string") return;
    const parts = extractSessionDocParts(entry);
    if (parts.length === 0) return;
    const ts = sessionEntryTime(entry);
    for (const part of parts) {
      if (part.kind === "user" && !meta.title) meta.title = firstLine(part.text);
      const result = this.insertDoc.run(
        fileId,
        entry.id,
        part.part,
        part.kind,
        part.tool ?? null,
        part.toolCallId ?? null,
        ts,
        lineOffset,
        line.length,
      );
      this.insertFts.run(Number(result.lastInsertRowid), part.text);
    }
  }

  /** Read one entry line from its session file. */
  private readLine(row: Pick<DocRow, "path" | "line_offset" | "line_length">, fdCache?: Map<string, number>): string | undefined {
    let fd = fdCache?.get(row.path);
    const ownFd = fd === undefined && !fdCache;
    try {
      if (fd === undefined) {
        fd = fs.openSync(row.path, "r");
        fdCache?.set(row.path, fd);
      }
      const buffer = Buffer.allocUnsafe(row.line_length);
      const bytesRead = fs.readSync(fd, buffer, 0, row.line_length, row.line_offset);
      return buffer.toString("utf8", 0, bytesRead);
    } catch {
      return undefined;
    } finally {
      if (ownFd && fd !== undefined) fs.closeSync(fd);
    }
  }

  /** Read and extract one doc's part text from its session file. */
  private readPart(row: Pick<DocRow, "path" | "line_offset" | "line_length" | "part">, fdCache?: Map<string, number>): SessionDocPart | undefined {
    const line = this.readLine(row, fdCache);
    if (line === undefined) return undefined;
    try {
      return extractSessionDocParts(JSON.parse(line) as RawSessionEntry).find((part) => part.part === row.part);
    } catch {
      return undefined;
    }
  }

  private toHit(row: DocRow, text: string, ranges: MatchRange[]): SessionSearchHit {
    const snippet = snippetAround(text, ranges);
    const hit: SessionSearchHit = {
      docId: row.id,
      sessionPath: row.path,
      sessionId: row.session_id,
      sessionTitle: row.name || row.title,
      cwd: row.cwd,
      entryId: row.entry_id,
      part: row.part,
      kind: row.kind,
      ts: row.ts,
      snippet: snippet.text,
      snippetRanges: snippet.ranges,
    };
    if (row.tool) hit.tool = row.tool;
    if (row.tool_call_id) hit.toolCallId = row.tool_call_id;
    return hit;
  }

  search(request: SessionSearchRequest): SessionSearchResponse {
    const query = parseSessionSearchQuery(request.query);
    const kinds = query.kinds.length > 0 ? query.kinds : request.roleFilter;
    const limit = request.limit;
    const match = buildTrigramMatch(query.terms);

    const filters: string[] = [];
    const params: Array<string | number> = [];
    if (kinds.length > 0) {
      filters.push(`d.kind IN (${kinds.map(() => "?").join(", ")})`);
      params.push(...kinds);
    }
    if (query.tool) {
      filters.push("lower(coalesce(d.tool, '')) LIKE ?");
      params.push(`%${query.tool}%`);
    }
    if (query.cwd) {
      filters.push("lower(f.cwd) LIKE ?");
      params.push(`%${query.cwd}%`);
    }
    const where = filters.length > 0 ? `AND ${filters.join(" AND ")}` : "";
    const select = `SELECT d.*, f.path, f.session_id, f.cwd, f.name, f.title FROM session_docs d JOIN session_files f ON f.id = d.file_id`;

    let rows: DocRow[];
    const candidateCap = 20000;
    if (match) {
      rows = this.db
        .prepare(
          `WITH c AS (SELECT rowid AS id FROM session_fts WHERE session_fts MATCH ? ORDER BY rowid DESC LIMIT ${candidateCap})
           ${select} JOIN c ON c.id = d.id WHERE 1 ${where} ORDER BY d.id DESC`,
        )
        .all(match, ...params) as unknown as DocRow[];
    } else {
      // No term long enough for the index: scan the newest docs.
      rows = this.db
        .prepare(`${select} WHERE 1 ${where} ORDER BY d.ts DESC LIMIT ${query.terms.length > 0 ? 5000 : limit}`)
        .all(...params) as unknown as DocRow[];
    }

    const hits: SessionSearchHit[] = [];
    const fdCache = new Map<string, number>();
    // An assistant line holds several parts; parse each line once per search.
    const parsedLines = new Map<string, SessionDocPart[] | null>();
    const deadline = Date.now() + 600;
    let truncated = rows.length >= candidateCap;
    try {
      for (const row of rows) {
        if (hits.length >= limit || Date.now() > deadline) {
          truncated = true;
          break;
        }
        const lineKey = `${row.file_id}:${row.line_offset}`;
        let parts = parsedLines.get(lineKey);
        if (parts === undefined) {
          const line = this.readLine(row, fdCache);
          parts = null;
          if (line !== undefined && rawLineMayMatch(line, query.terms)) {
            try {
              parts = extractSessionDocParts(JSON.parse(line) as RawSessionEntry);
            } catch {
              parts = null;
            }
          }
          parsedLines.set(lineKey, parts);
        }
        const part = parts?.find((p) => p.part === row.part);
        if (!part) continue;
        const ranges = findTermRanges(part.text, query.terms);
        if (!ranges) continue;
        hits.push(this.toHit(row, part.text, ranges));
      }
    } finally {
      for (const fd of fdCache.values()) fs.closeSync(fd);
    }
    hits.sort((a, b) => b.ts - a.ts);
    return { hits, candidates: rows.length, truncated };
  }

  preview(docId: number, query: string): SessionDocPreview | undefined {
    const select = `SELECT d.*, f.path, f.session_id, f.cwd, f.name, f.title FROM session_docs d JOIN session_files f ON f.id = d.file_id`;
    const row = this.db.prepare(`${select} WHERE d.id = ?`).get(docId) as unknown as DocRow | undefined;
    if (!row) return undefined;
    const part = this.readPart(row);
    if (!part) return undefined;
    const terms = parseSessionSearchQuery(query).terms;
    const neighbour = (r: DocRow) => {
      const p = this.readPart(r);
      return p ? { kind: p.kind, ...(p.tool ? { tool: p.tool } : {}), text: p.text } : undefined;
    };
    const beforeRows = this.db
      .prepare(`${select} WHERE d.file_id = ? AND d.id < ? ORDER BY d.id DESC LIMIT 2`)
      .all(row.file_id, row.id) as unknown as DocRow[];
    const afterRows = this.db
      .prepare(`${select} WHERE d.file_id = ? AND d.id > ? ORDER BY d.id ASC LIMIT 2`)
      .all(row.file_id, row.id) as unknown as DocRow[];
    return {
      text: part.text,
      ranges: findTermRanges(part.text, terms, 512) ?? [],
      before: beforeRows.reverse().map(neighbour).filter((n) => n !== undefined),
      after: afterRows.map(neighbour).filter((n) => n !== undefined),
    };
  }
}
