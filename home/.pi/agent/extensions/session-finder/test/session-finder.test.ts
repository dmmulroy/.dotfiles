import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { extractSessionDocParts } from "../extract.ts";
import { SessionIndexStore } from "../index-store.ts";
import { buildTrigramMatch, findTermRanges, parseSessionSearchQuery } from "../query.ts";

test("parseSessionSearchQuery reads role, tool and cwd filters", () => {
  assert.deepEqual(parseSessionSearchQuery("u: smart splits"), { terms: ["smart", "splits"], kinds: ["user"] });
  assert.deepEqual(parseSessionSearchQuery('t:bash "rex config"'), {
    terms: ["rex config"],
    kinds: ["toolCall", "toolResult"],
    tool: "bash",
  });
  assert.deepEqual(parseSessionSearchQuery("cwd:dotfiles a: hello"), { terms: ["hello"], kinds: ["assistant"], cwd: "dotfiles" });
  assert.deepEqual(parseSessionSearchQuery("http://x.y"), { terms: ["http://x.y"], kinds: [] });
});

test("findTermRanges requires every term and uses smart case", () => {
  assert.deepEqual(findTermRanges("Hello World", ["world", "hello"]), [
    [0, 5],
    [6, 11],
  ]);
  assert.equal(findTermRanges("Hello World", ["World", "nope"]), undefined);
  assert.equal(findTermRanges("hello world", ["World"]), undefined);
});

test("buildTrigramMatch ANDs trigrams and skips short terms", () => {
  assert.equal(buildTrigramMatch(["ab"]), undefined);
  assert.equal(buildTrigramMatch(["abcd"]), '"abc" AND "bcd"');
});

test("extractSessionDocParts splits assistant text and tool calls", () => {
  const parts = extractSessionDocParts({
    type: "message",
    id: "a1",
    message: {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "hidden" },
        { type: "text", text: "Running it" },
        { type: "toolCall", id: "call_1", name: "bash", arguments: { command: "ls -la", timeout: 5 } },
      ],
    },
  } as never);
  assert.deepEqual(parts, [
    { part: 0, kind: "assistant", text: "Running it" },
    { part: 1, kind: "toolCall", tool: "bash", toolCallId: "call_1", text: "bash: ls -la\ntimeout: 5" },
  ]);
});

function line(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function sessionLines(id: string, cwd: string, userText: string, toolOutput: string): string {
  return (
    line({ type: "session", version: 3, id, timestamp: "2026-01-01T00:00:00.000Z", cwd }) +
    line({ type: "message", id: `${id}-u`, parentId: null, timestamp: "2026-01-01T00:00:01.000Z", message: { role: "user", content: userText, timestamp: 1000 } }) +
    line({
      type: "message",
      id: `${id}-a`,
      parentId: `${id}-u`,
      timestamp: "2026-01-01T00:00:02.000Z",
      message: { role: "assistant", content: [{ type: "toolCall", id: `${id}-call`, name: "bash", arguments: { command: "rex config check" } }], timestamp: 2000 },
    }) +
    line({
      type: "message",
      id: `${id}-r`,
      parentId: `${id}-a`,
      timestamp: "2026-01-01T00:00:03.000Z",
      message: { role: "toolResult", toolCallId: `${id}-call`, toolName: "bash", content: [{ type: "text", text: toolOutput }], timestamp: 3000 },
    })
  );
}

test("SessionIndexStore indexes, searches, appends incrementally and re-indexes rewrites", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-finder-"));
  try {
    const sessions = path.join(root, "sessions");
    const project = path.join(sessions, "--tmp-project--");
    fs.mkdirSync(project, { recursive: true });
    const fileA = path.join(project, "a.jsonl");
    const fileB = path.join(project, "b.jsonl");
    fs.writeFileSync(fileA, sessionLines("sa", "/tmp/alpha", "Wire smart-splits to Rex", "config ok"));
    fs.writeFileSync(fileB, sessionLines("sb", "/tmp/beta", "unrelated question", "nothing here"));

    const store = new SessionIndexStore(path.join(root, "index.sqlite"), sessions, () => {});
    await store.refresh();

    let response = store.search({ query: "smart-splits", roleFilter: [], limit: 50 });
    assert.equal(response.hits.length, 1);
    assert.equal(response.hits[0]!.entryId, "sa-u");
    assert.equal(response.hits[0]!.sessionTitle, "Wire smart-splits to Rex");
    assert.equal(response.hits[0]!.cwd, "/tmp/alpha");

    response = store.search({ query: "t:bash rex config", roleFilter: [], limit: 50 });
    assert.deepEqual(response.hits.map((h) => h.entryId).sort(), ["sa-a", "sb-a"]);
    assert.equal(response.hits[0]!.toolCallId?.endsWith("-call"), true);

    response = store.search({ query: "cwd:beta rex", roleFilter: [], limit: 50 });
    assert.deepEqual(response.hits.map((h) => h.entryId), ["sb-a"]);

    // Trigram candidates are verified: "config ok" contains every trigram of "fig ok" but not "ok config".
    response = store.search({ query: '"ok config"', roleFilter: [], limit: 50 });
    assert.equal(response.hits.length, 0);

    // Role filter from Tab.
    response = store.search({ query: "", roleFilter: ["user"], limit: 50 });
    assert.deepEqual(response.hits.map((h) => h.entryId).sort(), ["sa-u", "sb-u"]);

    // Append: only the new line is indexed.
    fs.appendFileSync(
      fileA,
      line({ type: "message", id: "sa-u2", parentId: "sa-r", timestamp: "2026-01-01T00:00:04.000Z", message: { role: "user", content: "follow up about kittens", timestamp: 4000 } }),
    );
    await store.refresh();
    response = store.search({ query: "kittens", roleFilter: [], limit: 50 });
    assert.deepEqual(response.hits.map((h) => h.entryId), ["sa-u2"]);
    response = store.search({ query: "smart-splits", roleFilter: [], limit: 50 });
    assert.equal(response.hits.length, 1, "appending must not duplicate earlier docs");

    // Rewrite (smaller file): old docs disappear.
    fs.writeFileSync(fileA, sessionLines("sc", "/tmp/alpha", "brand new", "x"));
    await store.refresh();
    assert.equal(store.search({ query: "kittens", roleFilter: [], limit: 50 }).hits.length, 0);
    assert.equal(store.search({ query: "brand new", roleFilter: [], limit: 50 }).hits.length, 1);

    // Deleted file.
    fs.rmSync(fileB);
    await store.refresh();
    assert.equal(store.search({ query: "unrelated", roleFilter: [], limit: 50 }).hits.length, 0);

    // Preview reads the text back from the file, with neighbours.
    const hit = store.search({ query: "brand", roleFilter: [], limit: 50 }).hits[0]!;
    const preview = store.preview(hit.docId, "brand");
    assert.equal(preview?.text, "brand new");
    assert.deepEqual(preview?.ranges, [[0, 5]]);
    assert.equal(preview?.after[0]?.kind, "toolCall");
    store.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
