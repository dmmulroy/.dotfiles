/**
 * `@issue` GitHub issues and `@pr` GitHub PRs autocomplete provider.
 *
 * On `@issue`, `@issue:<token>`, or `@issue <token>` in the input editor, suggests open issues from the current repo.
 * On `@pr`, `@pr:<token>`, or `@pr <token>` in the input editor, suggests recent PRs from the current repo.
 *
 * Accepting a completion inserts the reference (e.g. `issue owner/repo#123` or `pr owner/repo#45`).
 * A `before_agent_start` nudge tells the agent how to fetch details with `gh`.
 *
 * Issues and PRs are served from cache immediately, refreshed in the background,
 * and exact numeric misses are fetched on demand.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  fuzzyFilter,
  type AutocompleteItem,
  type AutocompleteProvider,
  type AutocompleteSuggestions,
} from "@earendil-works/pi-tui";

// --- Constants ---

const ISSUE_PREFIX = "@issue";
const PR_PREFIX = "@pr";

/** Match `@issue`, `@issue:`, `@issue:<token>`, or `@issue <token>` at end of text before cursor. */
const ISSUE_TOKEN_RE = /(?:^|\s)(@issue(?:(?::|\s+)\s*([^\s@]*))?)$/;

/** Match `@pr`, `@pr:`, `@pr:<token>`, or `@pr <token>` at end of text before cursor. */
const PR_TOKEN_RE = /(?:^|\s)(@pr(?:(?::|\s+)\s*([^\s@]*))?)$/;

const MAX_SUGGESTIONS = 20;
const GH_TIMEOUT_MS = 5_000;
const CACHE_REFRESH_INTERVAL_MS = 30_000;

// --- Types ---

interface RepoInfo {
  owner: string;
  repo: string;
  /** `owner/repo` string */
  fullName: string;
}

interface IssueInfo {
  number: number;
  title: string;
  labels: string;
  author: string;
  updatedAt: string;
}

interface PRInfo {
  number: number;
  title: string;
  state: string;
  author: string;
  headRefName: string;
  updatedAt: string;
  isDraft: boolean;
}

interface CachedData {
  repo: RepoInfo | null;
  issues: IssueInfo[];
  prs: PRInfo[];
  fetchedAt?: string;
}

function getCachePath(cwd: string): string {
  return join(cwd, ".pi", "cache", "github-refs.json");
}

async function readCache(cwd: string): Promise<CachedData> {
  try {
    const raw = await readFile(getCachePath(cwd), "utf8");
    const data = JSON.parse(raw) as CachedData;
    return {
      repo: data.repo ?? null,
      issues: Array.isArray(data.issues) ? data.issues : [],
      prs: Array.isArray(data.prs)
        ? data.prs.map((pr) => ({ ...pr, state: pr.state ?? "OPEN" }))
        : [],
      fetchedAt: typeof data.fetchedAt === "string" ? data.fetchedAt : undefined,
    };
  } catch {
    return { repo: null, issues: [], prs: [] };
  }
}

async function writeCache(cwd: string, data: CachedData): Promise<void> {
  const cachePath = getCachePath(cwd);
  await mkdir(join(cwd, ".pi", "cache"), { recursive: true });
  await writeFile(cachePath, JSON.stringify(data, null, 2), "utf8");
}

function replaceData(target: CachedData, source: CachedData): void {
  target.repo = source.repo;
  target.issues = source.issues;
  target.prs = source.prs;
  target.fetchedAt = source.fetchedAt;
}

function cacheTimestamp(data: CachedData): number {
  const parsed = data.fetchedAt ? Date.parse(data.fetchedAt) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function replaceDataIfNewer(target: CachedData, source: CachedData): void {
  if (cacheTimestamp(source) >= cacheTimestamp(target)) {
    replaceData(target, source);
  }
}

function upsertIssue(data: CachedData, issue: IssueInfo): void {
  data.issues = [issue, ...data.issues.filter((item) => item.number !== issue.number)];
}

function upsertPR(data: CachedData, pr: PRInfo): void {
  data.prs = [pr, ...data.prs.filter((item) => item.number !== pr.number)];
}

function shouldRefresh(data: CachedData): boolean {
  const fetchedAt = data.fetchedAt ? Date.parse(data.fetchedAt) : 0;
  return !Number.isFinite(fetchedAt) || Date.now() - fetchedAt > CACHE_REFRESH_INTERVAL_MS;
}

// --- Shell helpers (use pi.exec) ---

function repoInfoFromRemoteUrl(remoteUrl: string): RepoInfo | null {
  const match = remoteUrl.trim().match(
    /(?:github\.com[:/])([^/]+)\/([^/\s]+?)(?:\.git)?$/,
  );
  const owner = match?.[1] ?? "";
  const repo = match?.[2] ?? "";
  if (!owner || !repo) return null;
  return { owner, repo, fullName: `${owner}/${repo}` };
}

async function fetchRepoName(
  exec: ExtensionAPI["exec"],
  cwd: string,
): Promise<RepoInfo | null> {
  const remote = await exec("git", ["remote", "get-url", "origin"], {
    cwd,
    timeout: 1_000,
  });

  if (remote.code === 0 && remote.stdout.trim()) {
    const repo = repoInfoFromRemoteUrl(remote.stdout);
    if (repo) return repo;
  }

  const result = await exec("gh", ["repo", "view", "--json", "owner,name"], {
    cwd,
    timeout: GH_TIMEOUT_MS,
  });

  if (result.code !== 0 || !result.stdout.trim()) return null;

  try {
    const data = JSON.parse(result.stdout) as {
      owner: { login: string };
      name: string;
    };
    const owner = data.owner?.login ?? "";
    const repo = data.name ?? "";
    if (!owner || !repo) return null;
    return { owner, repo, fullName: `${owner}/${repo}` };
  } catch {
    return null;
  }
}

async function fetchIssues(
  exec: ExtensionAPI["exec"],
  cwd: string,
): Promise<IssueInfo[] | null> {
  const result = await exec(
    "gh",
    ["issue", "list", "--json", "number,title,labels,author,updatedAt", "--limit", "50", "--state", "open"],
    { cwd, timeout: GH_TIMEOUT_MS },
  );

  if (result.code !== 0 || !result.stdout.trim()) return null;

  try {
    const items = JSON.parse(result.stdout) as Array<{
      number: number;
      title: string;
      labels: Array<{ name: string }>;
      author: { login: string };
      updatedAt: string;
    }>;

    return items.map((item) => ({
      number: item.number,
      title: item.title,
      labels: item.labels.map((l) => l.name).join(", "),
      author: item.author?.login ?? "",
      updatedAt: item.updatedAt,
    }));
  } catch {
    return null;
  }
}

async function fetchIssueByNumber(
  exec: ExtensionAPI["exec"],
  cwd: string,
  number: number,
): Promise<IssueInfo | null> {
  const result = await exec(
    "gh",
    [
      "issue",
      "view",
      String(number),
      "--json",
      "number,title,labels,author,updatedAt",
    ],
    { cwd, timeout: GH_TIMEOUT_MS },
  );

  if (result.code !== 0 || !result.stdout.trim()) return null;

  try {
    const item = JSON.parse(result.stdout) as {
      number: number;
      title: string;
      labels: Array<{ name: string }>;
      author: { login: string };
      updatedAt: string;
    };

    return {
      number: item.number,
      title: item.title,
      labels: item.labels.map((l) => l.name).join(", "),
      author: item.author?.login ?? "",
      updatedAt: item.updatedAt,
    };
  } catch {
    return null;
  }
}

async function fetchPRs(
  exec: ExtensionAPI["exec"],
  cwd: string,
): Promise<PRInfo[] | null> {
  const result = await exec(
    "gh",
    [
      "pr",
      "list",
      "--json",
      "number,title,state,author,headRefName,updatedAt,isDraft",
      "--limit",
      "100",
      "--state",
      "all",
    ],
    { cwd, timeout: GH_TIMEOUT_MS },
  );

  if (result.code !== 0 || !result.stdout.trim()) return null;

  try {
    const items = JSON.parse(result.stdout || "[]") as Array<{
      number: number;
      title: string;
      state: string;
      author: { login: string };
      headRefName: string;
      updatedAt: string;
      isDraft: boolean;
    }>;

    return items.map((item) => ({
      number: item.number,
      title: item.title,
      state: item.state ?? "",
      author: item.author?.login ?? "",
      headRefName: item.headRefName,
      updatedAt: item.updatedAt,
      isDraft: item.isDraft,
    }));
  } catch {
    return null;
  }
}

async function fetchPRByNumber(
  exec: ExtensionAPI["exec"],
  cwd: string,
  number: number,
): Promise<PRInfo | null> {
  const result = await exec(
    "gh",
    [
      "pr",
      "view",
      String(number),
      "--json",
      "number,title,state,author,headRefName,updatedAt,isDraft",
    ],
    { cwd, timeout: GH_TIMEOUT_MS },
  );

  if (result.code !== 0 || !result.stdout.trim()) return null;

  try {
    const item = JSON.parse(result.stdout) as {
      number: number;
      title: string;
      state: string;
      author: { login: string };
      headRefName: string;
      updatedAt: string;
      isDraft: boolean;
    };

    return {
      number: item.number,
      title: item.title,
      state: item.state ?? "",
      author: item.author?.login ?? "",
      headRefName: item.headRefName,
      updatedAt: item.updatedAt,
      isDraft: item.isDraft,
    };
  } catch {
    return null;
  }
}

/** Fetch all data needed for the session in parallel. */
async function fetchIssueSnapshot(
  exec: ExtensionAPI["exec"],
  cwd: string,
  previous?: CachedData,
): Promise<CachedData> {
  const [repo, issues] = await Promise.all([
    previous?.repo ? Promise.resolve(previous.repo) : fetchRepoName(exec, cwd),
    fetchIssues(exec, cwd),
  ]);
  return {
    repo: repo ?? previous?.repo ?? null,
    issues: issues ?? previous?.issues ?? [],
    prs: previous?.prs ?? [],
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchPRSnapshot(
  exec: ExtensionAPI["exec"],
  cwd: string,
  previous?: CachedData,
): Promise<CachedData> {
  const [repo, prs] = await Promise.all([
    previous?.repo ? Promise.resolve(previous.repo) : fetchRepoName(exec, cwd),
    fetchPRs(exec, cwd),
  ]);
  return {
    repo: repo ?? previous?.repo ?? null,
    issues: previous?.issues ?? [],
    prs: prs ?? previous?.prs ?? [],
    fetchedAt: new Date().toISOString(),
  };
}

// --- Autocomplete replacement ---

function replaceAutocompletePrefix(
  lines: string[],
  cursorLine: number,
  cursorCol: number,
  prefix: string,
  value: string,
) {
  const currentLine = lines[cursorLine] ?? "";
  const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
  const afterCursor = currentLine.slice(cursorCol);
  const newLines = [...lines];
  newLines[cursorLine] = `${beforePrefix}${value}${afterCursor}`;

  return {
    lines: newLines,
    cursorLine,
    cursorCol: beforePrefix.length + value.length,
  };
}

function extractPrefixCandidate(
  textBeforeCursor: string,
  targetPrefix: string,
): string | undefined {
  const match = textBeforeCursor.match(/(^|\s)(@\S*)$/);
  const candidate = match?.[2];
  if (!candidate || !targetPrefix.startsWith(candidate)) return undefined;
  return candidate;
}

function createPrefixCompletionItem(
  value: string,
  label: string,
  description: string,
): AutocompleteItem {
  return { value, label, description };
}

function filterIssues(issues: IssueInfo[], token: string): IssueInfo[] {
  const query = token.trim();
  if (!query) return issues.slice(0, MAX_SUGGESTIONS);

  if (/^\d+$/.test(query)) {
    const numericMatches = issues.filter((issue) =>
      String(issue.number).startsWith(query),
    );
    if (numericMatches.length > 0) {
      return numericMatches.slice(0, MAX_SUGGESTIONS);
    }
  }

  return fuzzyFilter(
    issues,
    query,
    (issue) => `${issue.number} ${issue.title} ${issue.labels} ${issue.author}`,
  ).slice(0, MAX_SUGGESTIONS);
}

function filterPRs(prs: PRInfo[], token: string): PRInfo[] {
  const query = token.trim();
  if (!query) return prs.slice(0, MAX_SUGGESTIONS);

  if (/^\d+$/.test(query)) {
    const numericMatches = prs.filter((pr) =>
      String(pr.number).startsWith(query),
    );
    if (numericMatches.length > 0) {
      return numericMatches.slice(0, MAX_SUGGESTIONS);
    }
  }

  return fuzzyFilter(
    prs,
    query,
    (pr) => `${pr.number} ${pr.title} ${pr.headRefName} ${pr.state} ${pr.author}`,
  ).slice(0, MAX_SUGGESTIONS);
}

// --- Provider factory ---

interface ProviderRefreshOptions {
  refreshFromDisk?: () => Promise<void>;
  refreshIfStale?: () => void;
  fetchIssueByNumber?: (number: number) => Promise<IssueInfo | null>;
  fetchPRByNumber?: (number: number) => Promise<PRInfo | null>;
}

export function createGithubAutocompleteProvider(
  current: AutocompleteProvider,
  data: CachedData,
  refreshOptions: ProviderRefreshOptions = {},
): AutocompleteProvider {
  return {
    async getSuggestions(
      lines: string[],
      cursorLine: number,
      cursorCol: number,
      options,
    ): Promise<AutocompleteSuggestions | null> {
      const currentLine = lines[cursorLine] ?? "";
      const textBeforeCursor = currentLine.slice(0, cursorCol);

      const issueMatch = textBeforeCursor.match(ISSUE_TOKEN_RE);
      const prMatch = textBeforeCursor.match(PR_TOKEN_RE);
      const issuePrefix = issueMatch?.[1];
      const prPrefix = prMatch?.[1];
      const issueToken = issueMatch ? issueMatch[2] ?? "" : undefined;
      const prToken = prMatch ? prMatch[2] ?? "" : undefined;

      // Neither complete prefix matched — check for partial prefix candidates first.
      // Do not await the built-in @file provider for @iss/@pr-like input: pi queues
      // autocomplete requests serially, so slow file scans can delay issue results.
      if (issueToken === undefined && prToken === undefined) {
        const prefixItems: AutocompleteItem[] = [];

        const issueCandidate = extractPrefixCandidate(textBeforeCursor, `${ISSUE_PREFIX}:`);
        if (issueCandidate !== undefined) {
          prefixItems.push(
            createPrefixCompletionItem(ISSUE_PREFIX, ISSUE_PREFIX, "GitHub issues"),
          );
        }

        const prCandidate = extractPrefixCandidate(textBeforeCursor, `${PR_PREFIX}:`);
        if (prCandidate !== undefined) {
          prefixItems.push(
            createPrefixCompletionItem(PR_PREFIX, PR_PREFIX, "GitHub pull requests"),
          );
        }

        if (prefixItems.length > 0) {
          return {
            items: prefixItems,
            prefix: issueCandidate ?? prCandidate ?? "",
          };
        }

        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      if (options.signal.aborted) return null;

      await refreshOptions.refreshFromDisk?.();
      refreshOptions.refreshIfStale?.();

      const repoPrefix = data.repo ? `${data.repo.fullName}#` : "#";

      // --- Issues ---
      if (issueToken !== undefined) {
        let filtered = filterIssues(data.issues, issueToken);

        if (
          filtered.length === 0 &&
          /^\d{2,}$/.test(issueToken) &&
          refreshOptions.fetchIssueByNumber
        ) {
          const fetched = await refreshOptions.fetchIssueByNumber(Number(issueToken));
          if (fetched) filtered = [fetched];
        }

        if (options.signal.aborted || filtered.length === 0) return null;

        const items: AutocompleteItem[] = filtered.map((i) => ({
          value: `issue ${repoPrefix}${i.number}`,
          label: `#${i.number} ${i.title}`,
          description: [i.labels, i.author].filter(Boolean).join(" · "),
        }));

        return { items, prefix: issuePrefix ?? `${ISSUE_PREFIX}:${issueToken}` };
      }

      // --- PRs ---
      if (prToken !== undefined) {
        let filtered = filterPRs(data.prs, prToken);

        if (
          filtered.length === 0 &&
          /^\d{2,}$/.test(prToken) &&
          refreshOptions.fetchPRByNumber
        ) {
          const fetched = await refreshOptions.fetchPRByNumber(Number(prToken));
          if (fetched) filtered = [fetched];
        }

        if (options.signal.aborted || filtered.length === 0) return null;

        const items: AutocompleteItem[] = filtered.map((p) => ({
          value: `pr ${repoPrefix}${p.number}`,
          label: `#${p.number} ${p.title}`,
          description: [
            p.state.toLowerCase(),
            p.headRefName,
            p.author,
            p.isDraft ? "draft" : "",
          ]
            .filter(Boolean)
            .join(" · "),
        }));

        return { items, prefix: prPrefix ?? `${PR_PREFIX}:${prToken}` };
      }

      return current.getSuggestions(lines, cursorLine, cursorCol, options);
    },

    applyCompletion(
      lines: string[],
      cursorLine: number,
      cursorCol: number,
      item: AutocompleteItem,
      prefix: string,
    ) {
      if (prefix.startsWith(ISSUE_PREFIX) || prefix.startsWith(PR_PREFIX)) {
        return replaceAutocompletePrefix(
          lines,
          cursorLine,
          cursorCol,
          prefix,
          item.value,
        );
      }

      // Prefix item completion (typing toward `@issue` or `@pr`)
      if (item.value === ISSUE_PREFIX || item.value === PR_PREFIX) {
        return replaceAutocompletePrefix(
          lines,
          cursorLine,
          cursorCol,
          prefix,
          item.value,
        );
      }

      return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },

    shouldTriggerFileCompletion(
      lines: string[],
      cursorLine: number,
      cursorCol: number,
    ) {
      const currentLine = lines[cursorLine] ?? "";
      const textBeforeCursor = currentLine.slice(0, cursorCol);
      if (
        textBeforeCursor.match(ISSUE_TOKEN_RE) ||
        textBeforeCursor.match(PR_TOKEN_RE)
      ) {
        return true;
      }
      return (
        current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ??
        true
      );
    },
  };
}

// --- Nudge on before_agent_start ---

/** Match `issue org/repo#123` or `issue #123` */
const ISSUE_REF_RE = /issue\s+(\S+?#(\d+))/g;
/** Match `pr org/repo#45` or `pr #45` */
const PR_REF_RE = /pr\s+(\S+?#(\d+))/g;

interface RefMatch {
  type: "issue" | "pr";
  /** Full reference string e.g. `owner/repo#123` */
  refs: string[];
}

function buildNudge(matches: RefMatch[]): string {
  const lines: string[] = [];

  for (const m of matches) {
    const uniqueRefs = [...new Set(m.refs)];
    if (m.type === "issue" && uniqueRefs.length > 0) {
      lines.push(
        `GitHub issues referenced: ${uniqueRefs.map((r) => `issue ${r}`).join(", ")}.`,
        `To fetch issue details, use: gh issue view <number> --json number,title,body,labels,author,assignees,comments`,
        `To list issues, use: gh issue list --json number,title,labels,author,updatedAt --state open`,
      );
    }
    if (m.type === "pr" && uniqueRefs.length > 0) {
      lines.push(
        `GitHub PRs referenced: ${uniqueRefs.map((r) => `pr ${r}`).join(", ")}.`,
        `To fetch PR details, use: gh pr view <number> --json number,title,body,headRefName,baseRefName,author,reviews,mergeable`,
        `To list PRs, use: gh pr list --json number,title,state,author,headRefName,updatedAt,isDraft --state all`,
      );
    }
  }

  return lines.join("\n");
}

// --- Extension entry point ---

export default async function (pi: ExtensionAPI) {
  let refreshTimer: ReturnType<typeof setInterval> | undefined;

  pi.on("session_start", async (_event, ctx) => {
    const cwd = ctx.cwd;
    const data = await readCache(cwd);
    let issueRefreshInFlight: Promise<void> | undefined;
    let prRefreshInFlight: Promise<void> | undefined;

    const refreshFromDisk = async () => {
      const cached = await readCache(cwd);
      if (
        cached.repo !== null ||
        cached.issues.length > 0 ||
        cached.prs.length > 0 ||
        cached.fetchedAt !== undefined
      ) {
        replaceDataIfNewer(data, cached);
      }
    };

    const refreshIssuesFromGithub = (force = false): Promise<void> => {
      if (!force && !shouldRefresh(data)) return Promise.resolve();
      issueRefreshInFlight ??= fetchIssueSnapshot(pi.exec, cwd, data)
        .then(async (fresh) => {
          replaceData(data, fresh);
          await writeCache(cwd, fresh);
        })
        .catch(() => {
          // Keep stale cache when gh is unavailable or slow.
        })
        .finally(() => {
          issueRefreshInFlight = undefined;
        });
      return issueRefreshInFlight;
    };

    const refreshPRsFromGithub = (force = false): Promise<void> => {
      if (!force && !shouldRefresh(data)) return Promise.resolve();
      prRefreshInFlight ??= fetchPRSnapshot(pi.exec, cwd, data)
        .then(async (fresh) => {
          replaceData(data, fresh);
          await writeCache(cwd, fresh);
        })
        .catch(() => {
          // Keep stale cache when gh is unavailable or slow.
        })
        .finally(() => {
          prRefreshInFlight = undefined;
        });
      return prRefreshInFlight;
    };

    const fetchAndCacheIssueByNumber = async (number: number) => {
      const issue = await fetchIssueByNumber(pi.exec, cwd, number);
      if (issue) {
        upsertIssue(data, issue);
        data.fetchedAt = new Date().toISOString();
        await writeCache(cwd, data).catch(() => undefined);
      }
      return issue;
    };

    const fetchAndCachePRByNumber = async (number: number) => {
      const pr = await fetchPRByNumber(pi.exec, cwd, number);
      if (pr) {
        upsertPR(data, pr);
        data.fetchedAt = new Date().toISOString();
        await writeCache(cwd, data).catch(() => undefined);
      }
      return pr;
    };

    ctx.ui.addAutocompleteProvider((current) =>
      createGithubAutocompleteProvider(current, data, {
        refreshFromDisk,
        refreshIfStale: () => void refreshIssuesFromGithub(false),
        fetchIssueByNumber: fetchAndCacheIssueByNumber,
        fetchPRByNumber: fetchAndCachePRByNumber,
      }),
    );

    void refreshIssuesFromGithub(true);
    setTimeout(() => void refreshPRsFromGithub(true), 1_000).unref?.();
    refreshTimer = setInterval(
      () => void refreshIssuesFromGithub(false),
      CACHE_REFRESH_INTERVAL_MS,
    );
    refreshTimer.unref?.();
  });

  pi.on("session_shutdown", async () => {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = undefined;
  });

  pi.on("before_agent_start", async (event) => {
    const text = event.prompt;

    const issueRefs: string[] = [];
    const prRefs: string[] = [];

    let match: RegExpExecArray | null;

    const issueRe = new RegExp(ISSUE_REF_RE.source, "g");
    match = issueRe.exec(text);
    while (match !== null) {
      if (match[1]) issueRefs.push(match[1]);
      match = issueRe.exec(text);
    }

    const prRe = new RegExp(PR_REF_RE.source, "g");
    match = prRe.exec(text);
    while (match !== null) {
      if (match[1]) prRefs.push(match[1]);
      match = prRe.exec(text);
    }

    if (issueRefs.length === 0 && prRefs.length === 0) return;

    const nudge = buildNudge([
      { type: "issue", refs: issueRefs },
      { type: "pr", refs: prRefs },
    ]);

    return {
      message: {
        customType: "github-ref:nudge",
        content: nudge,
        display: false,
      },
    } as const;
  });
}
