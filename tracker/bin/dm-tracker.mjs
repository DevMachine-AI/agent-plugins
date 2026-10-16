#!/usr/bin/env node

// src/main.ts
import { spawn } from "node:child_process";
import { readFileSync as readFileSync6 } from "node:fs";

// src/api.ts
var HttpError = class extends Error {
  constructor(status, body) {
    super(`HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
};
async function request(url, o = {}) {
  const headers = { accept: "application/json" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  let body;
  if (o.json !== void 0) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(o.json);
  } else if (o.form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(o.form).toString();
  }
  const res = await fetch(url, { method: o.method ?? (body ? "POST" : "GET"), headers, body, signal: AbortSignal.timeout(o.timeoutMs ?? 15e3) });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!res.ok) throw new HttpError(res.status, parsed);
  return parsed;
}

// src/credentials.ts
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
var credentialsPath = (env) => join(env.XDG_CONFIG_HOME || join(env.HOME || homedir(), ".config"), "dm-tracker", "credentials.json");
function readCredentials(env) {
  try {
    const c = JSON.parse(readFileSync(credentialsPath(env), "utf8"));
    return c.token?.startsWith("cft_") && c.server ? c : null;
  } catch {
    return null;
  }
}
function writeCredentials(env, c) {
  const p = credentialsPath(env);
  mkdirSync(dirname(p), { recursive: true, mode: 448 });
  chmodSync(dirname(p), 448);
  writeFileSync(p, JSON.stringify(c, null, 2) + "\n", { mode: 384 });
  chmodSync(p, 384);
}
function removeCredentials(env) {
  const p = credentialsPath(env);
  if (existsSync(p)) rmSync(p);
}

// src/device.ts
import { hostname } from "node:os";
async function login(d) {
  const server = d.server.replace(/\/$/, "");
  const sleep = d.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const print = d.print ?? ((s) => process.stdout.write(s + "\n"));
  const cfg = await request(`${server}/api/v1/tracker/cli-config`);
  const oidc = `${cfg.issuer.replace(/\/$/, "")}/protocol/openid-connect`;
  const dev = await request(`${oidc}/auth/device`, {
    form: { client_id: cfg.clientId, scope: "openid email profile" }
  });
  const link = dev.verification_uri_complete ?? dev.verification_uri;
  print(`\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 ${link} \u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u043A\u043E\u0434 ${dev.user_code}`);
  d.open?.(link);
  let interval = (dev.interval ?? 5) * 1e3;
  const deadline = Date.now() + dev.expires_in * 1e3;
  for (; ; ) {
    await sleep(interval);
    try {
      const tok = await request(`${oidc}/token`, {
        form: { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: dev.device_code, client_id: cfg.clientId }
      });
      const minted = await request(`${server}/api/v1/tracker/agent-tokens/personal`, {
        token: tok.access_token,
        json: { name: d.name ?? hostname(), ...d.profiles ? { profiles: d.profiles } : {} }
      });
      writeCredentials(d.env, { server, token: minted.token, tokenId: minted.id, expiresAt: minted.expiresAt });
      print(`\u0413\u043E\u0442\u043E\u0432\u043E: \u0430\u0433\u0435\u043D\u0442 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D \u043A ${server} \u0434\u043E ${minted.expiresAt.slice(0, 10)}`);
      return;
    } catch (e) {
      const code = e instanceof HttpError ? e.body?.error : void 0;
      if (code === "authorization_pending") continue;
      if (code === "slow_down") {
        interval += 5e3;
        continue;
      }
      if (Date.now() > deadline || code === "expired_token") throw new Error("\u041A\u043E\u0434 \u0438\u0441\u0442\u0451\u043A \u2014 \u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u0435 \u0432\u0445\u043E\u0434 \u0437\u0430\u043D\u043E\u0432\u043E");
      throw e;
    }
  }
}

// src/git.ts
import { execFileSync } from "node:child_process";
var git = (cwd, ...args) => {
  try {
    return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 2e3, stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
};
function repoOf(cwd) {
  let url = git(cwd, "remote", "get-url", "origin");
  if (!url) {
    const first = git(cwd, "remote")?.split("\n")[0];
    url = first ? git(cwd, "remote", "get-url", first) : null;
  }
  if (!url) return null;
  url = url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/i, "$1");
  const branch = git(cwd, "symbolic-ref", "--short", "-q", "HEAD");
  return { url, branch };
}

// src/hooks.ts
import { mkdirSync as mkdirSync3, readFileSync as readFileSync3, writeFileSync as writeFileSync3 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { join as join3 } from "node:path";

// src/usage.ts
import { closeSync, existsSync as existsSync2, mkdirSync as mkdirSync2, openSync, readdirSync, readFileSync as readFileSync2, readSync, statSync, writeFileSync as writeFileSync2 } from "node:fs";
import { basename, dirname as dirname2, join as join2 } from "node:path";
function readFile(path, cachePath) {
  let cache = { offset: 0, messages: {} };
  try {
    cache = JSON.parse(readFileSync2(cachePath, "utf8"));
  } catch {
  }
  const size = statSync(path).size;
  if (size < cache.offset) cache = { offset: 0, messages: {} };
  if (size > cache.offset) {
    const fd = openSync(path, "r");
    const buf = Buffer.alloc(size - cache.offset);
    try {
      readSync(fd, buf, 0, buf.length, cache.offset);
    } finally {
      closeSync(fd);
    }
    const end = buf.lastIndexOf(10) + 1;
    for (const line of buf.subarray(0, end).toString("utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        const m = row.message;
        if (row.type !== "assistant" || !m?.id || !m.model || !m.usage || m.model === "<synthetic>") continue;
        const u = m.usage;
        cache.messages[m.id] = { model: m.model, input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 };
      } catch {
      }
    }
    cache.offset += end;
    mkdirSync2(dirname2(cachePath), { recursive: true });
    writeFileSync2(cachePath, JSON.stringify(cache));
  }
  return Object.values(cache.messages);
}
var safe = (s) => s.replace(/[^\w.-]/g, "_");
async function readUsage(transcriptPath, cacheDir) {
  if (!existsSync2(transcriptPath)) return [];
  const session = basename(transcriptPath, ".jsonl");
  const files = [transcriptPath];
  const sub = join2(dirname2(transcriptPath), session, "subagents");
  try {
    for (const f of readdirSync(sub).sort()) if (f.endsWith(".jsonl")) files.push(join2(sub, f));
  } catch {
  }
  const totals = /* @__PURE__ */ new Map();
  for (const f of files) {
    const cache = join2(cacheDir, `usage-${safe(session)}${f === transcriptPath ? "" : `-${safe(basename(f, ".jsonl"))}`}.json`);
    for (const u of readFile(f, cache)) {
      const t = totals.get(u.model) ?? { model: u.model, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
      t.input += u.input;
      t.output += u.output;
      t.cacheRead += u.cacheRead;
      t.cacheWrite += u.cacheWrite;
      totals.set(u.model, t);
    }
  }
  return [...totals.values()].sort((a, b) => a.model.localeCompare(b.model));
}

// src/hooks.ts
var HOOK_TIMEOUT_MS = 3e3;
var HEARTBEAT_EVERY_MS = 6e4;
async function runHook(event, stdin, d) {
  try {
    const input = JSON.parse(stdin || "{}");
    const creds = readCredentials(d.env);
    const repo = repoOf(input.cwd || process.cwd());
    if (!creds || !repo) return "";
    const post = (path, extra = {}) => request(`${creds.server}/api/v1/tracker/agent/${path}`, { token: creds.token, json: { repoUrl: repo.url, branch: repo.branch, ...extra }, timeoutMs: HOOK_TIMEOUT_MS });
    const cacheDir = d.env.CLAUDE_PLUGIN_DATA || join3(d.env.HOME || homedir2(), ".cache", "dm-tracker");
    const usage = async (final) => {
      if (!input.transcript_path) return;
      const totals = await readUsage(input.transcript_path, cacheDir);
      if (!totals.length) return;
      await post("usage", { clientSessionRef: input.session_id, client: "claude-code", totals: totals.slice(0, 20), ...final ? { final: true } : {} }).catch(() => void 0);
    };
    if (event === "session-start") {
      const r = await post("context");
      if (!r.project) return "";
      const hint = `First call the tracker tool start_session with repoUrl=${repo.url}${repo.branch ? `, branch=${repo.branch}` : ""}${input.session_id ? `, clientSessionRef=${input.session_id}` : ""}.`;
      const k = r.project.key;
      const git2 = `Name the branch ${k.toLowerCase()}-<number>-<short> (e.g. ${k.toLowerCase()}-142-tabs); start every commit message with the task key ("${k}-<number>: \u2026") and end it with the trailers "Task: ${k}-<number>" and "Session: <session id>" (the id start_session returned). They are task keys, not AI-authorship trailers \u2014 never add Co-Authored-By or "Generated with" lines.`;
      return JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: `${r.text}
${hint}
${git2}`.slice(0, 1e4) } });
    }
    if (event === "post-tool-use") {
      const dir = cacheDir;
      const stamp = join3(dir, `heartbeat-${(input.session_id ?? "default").replace(/[^\w-]/g, "_")}`);
      const now = (d.now ?? Date.now)();
      let last = 0;
      try {
        last = Number(readFileSync3(stamp, "utf8")) || 0;
      } catch {
      }
      if (now - last < HEARTBEAT_EVERY_MS) return "";
      mkdirSync3(dir, { recursive: true });
      writeFileSync3(stamp, String(now));
      await post("heartbeat");
      return "";
    }
    if (event === "session-end") {
      await usage(true);
      return "";
    }
    if (event === "stop") {
      if (input.stop_hook_active) return "";
      const [r] = await Promise.all([post("check-stop"), usage(false)]);
      if (!r.remind) return "";
      return JSON.stringify({ decision: "block", reason: `\u041E\u0431\u043D\u043E\u0432\u0438 ${r.remind.key} \u0432 \u0442\u0440\u0435\u043A\u0435\u0440\u0435: log, submit_for_review \u0438\u043B\u0438 close_task (\u043D\u0435\u0442 \u0437\u0430\u043F\u0438\u0441\u0435\u0439 ${r.remind.minutesSilent} \u043C\u0438\u043D).` });
    }
    return "";
  } catch {
    return "";
  }
}

// src/import.ts
import { execFileSync as execFileSync2 } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync as readFileSync4 } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { join as join4 } from "node:path";

// ../tracker-domain/src/constants.ts
var IMPORT_LIMITS = { batch: 50, run: 5e3 };

// ../tracker-domain/src/gitlab.ts
function gitlabToItem(issue, repoPath, emails = /* @__PURE__ */ new Map()) {
  const assignee = issue.assignees?.[0] ?? issue.assignee ?? null;
  const email = assignee ? emails.get(assignee.id) : void 0;
  const description = issue.description?.slice(0, 5e4);
  return {
    externalRef: `gitlab:${repoPath}#${issue.iid}`,
    title: issue.title.trim().slice(0, 300),
    ...description ? { description } : {},
    type: issue.labels.some((l) => l.toLowerCase() === "bug") ? "bug" : "task",
    state: issue.state === "closed" ? "closed" : "opened",
    ...issue.milestone?.title ? { milestone: issue.milestone.title.slice(0, 200) } : {},
    ...email ? { assigneeEmail: email.trim().toLowerCase() } : {},
    url: issue.web_url,
    createdAt: issue.created_at
  };
}

// src/import.ts
function parseRepo(url) {
  const ssh = /^(?:ssh:\/\/)?git@([^:/]+)(?::\d+)?[:/](.+?)(?:\.git)?\/?$/.exec(url.trim());
  if (ssh) return { origin: `https://${ssh[1]}`, host: ssh[1], path: ssh[2] };
  try {
    const u = new URL(url.trim());
    const path = u.pathname.replace(/^\/|\/$/g, "").replace(/\.git$/, "").replace(/\/-\/.*$/, "");
    return path ? { origin: u.origin, host: u.host, path } : null;
  } catch {
    return null;
  }
}
function gitlabTokenFrom(env, host, askGlab = glabToken) {
  if (env.GITLAB_TOKEN) return env.GITLAB_TOKEN;
  const home = env.HOME || homedir3();
  const dirs = env.GLAB_CONFIG_DIR ? [env.GLAB_CONFIG_DIR] : [join4(env.XDG_CONFIG_HOME || join4(home, ".config"), "glab-cli"), join4(home, "Library", "Application Support", "glab-cli")];
  const known = /* @__PURE__ */ new Map();
  for (const dir of dirs) {
    let text;
    try {
      text = readFileSync4(join4(dir, "config.yml"), "utf8");
    } catch {
      continue;
    }
    for (const [h, t] of glabHosts(text)) if (!known.get(h)) known.set(h, t);
  }
  const ported = host.includes(":") ? [] : [...known.keys()].filter((h) => h.startsWith(`${host}:`));
  const names = [host, ...ported.length === 1 ? ported : []];
  for (const h of names) {
    const t = known.get(h);
    if (t) return t;
  }
  for (const h of names) {
    const t = askGlab(h);
    if (t) return t;
  }
  return null;
}
function glabToken(host) {
  try {
    return execFileSync2("glab", ["config", "get", "token", "--host", host], { encoding: "utf8", timeout: 1e4, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}
function glabHosts(text) {
  const out = /* @__PURE__ */ new Map();
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^hosts:\s*$/.test(l));
  if (start < 0) return out;
  const indent = (l) => l.match(/^\s*/)[0].length;
  let level = -1;
  for (let i = start + 1; i < lines.length && (/^\s/.test(lines[i]) || !lines[i].trim()); i++) {
    const m = /^(\s+)(\S+?):\s*$/.exec(lines[i]);
    if (!m) continue;
    if (level < 0) level = m[1].length;
    if (m[1].length !== level) continue;
    let token = null;
    for (let j = i + 1; j < lines.length && (indent(lines[j]) > level || !lines[j].trim()); j++) {
      const t = /^\s+token:\s*["']?([^"'\s]+)["']?\s*$/.exec(lines[j]);
      if (t) {
        token = t[1];
        break;
      }
    }
    out.set(m[2], token);
  }
  return out;
}
var TYPE = { bug: "\u041E\u0448\u0438\u0431\u043A\u0430", task: "\u0417\u0430\u0434\u0430\u0447\u0430" };
var cut = (s, n) => s.length > n ? `${s.slice(0, n - 1)}\u2026` : s;
var plural = (n) => n % 10 === 1 && n % 100 !== 11 ? "\u0437\u0430\u0434\u0430\u0447\u0430" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "\u0437\u0430\u0434\u0430\u0447\u0438" : "\u0437\u0430\u0434\u0430\u0447";
async function importGitlab(o, fetchImpl = fetch) {
  const repo = parseRepo(o.repo);
  if (!repo) {
    o.print(`\u041D\u0435 \u043F\u043E\u043D\u044F\u043B \u0430\u0434\u0440\u0435\u0441 \u0440\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u044F: ${o.repo}`);
    return 1;
  }
  const creds = readCredentials(o.env);
  if (!o.dryRun && !creds) {
    o.print("\u041D\u0435\u0442 \u0432\u0445\u043E\u0434\u0430 \u0432 \u0442\u0440\u0435\u043A\u0435\u0440 \u2014 \u0432\u044B\u043F\u043E\u043B\u043D\u0438\u0442\u0435 dm-tracker login");
    return 1;
  }
  const token = gitlabTokenFrom(o.env, repo.host);
  if (!token) {
    o.print(`\u041D\u0435\u0442 \u0442\u043E\u043A\u0435\u043D\u0430 GitLab \u0434\u043B\u044F ${repo.host}: \u0437\u0430\u0434\u0430\u0439\u0442\u0435 GITLAB_TOKEN (scope read_api) \u0438\u043B\u0438 \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0447\u0435\u0440\u0435\u0437 glab auth login`);
    return 1;
  }
  const api = `${repo.origin}/api/v4`;
  const gl = async (path) => {
    const res = await fetchImpl(`${api}${path}`, { headers: { "PRIVATE-TOKEN": token, accept: "application/json" }, signal: AbortSignal.timeout(3e4) });
    if (!res.ok) throw new Error(`GitLab \u043E\u0442\u0432\u0435\u0442\u0438\u043B ${res.status} \u043D\u0430 ${path.split("?")[0]}`);
    return { data: await res.json(), next: res.headers.get("x-next-page") || null };
  };
  const issues = [];
  try {
    let page = "1";
    while (page && issues.length < IMPORT_LIMITS.run) {
      const r = await gl(`/projects/${encodeURIComponent(repo.path)}/issues?state=${o.state}&per_page=100&page=${page}&order_by=created_at&sort=desc`);
      issues.push(...r.data);
      page = r.next;
    }
  } catch (e) {
    o.print(e.message);
    return 1;
  }
  if (issues.length > IMPORT_LIMITS.run) o.print(`\u0412\u0437\u044F\u0442\u044B \u043F\u0435\u0440\u0432\u044B\u0435 ${IMPORT_LIMITS.run}; \u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u0435 \u043A\u043E\u043C\u0430\u043D\u0434\u0443 \u0435\u0449\u0451 \u0440\u0430\u0437 \u2014 \u043F\u0435\u0440\u0435\u043D\u0435\u0441\u0451\u043D\u043D\u044B\u0435 \u0431\u0443\u0434\u0443\u0442 \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u044B`);
  const take = issues.slice(0, IMPORT_LIMITS.run);
  const emails = /* @__PURE__ */ new Map();
  for (const id of new Set(take.flatMap((i) => i.assignees?.[0] ?? i.assignee ? [(i.assignees?.[0] ?? i.assignee).id] : []))) {
    try {
      const u = (await gl(`/users/${id}`)).data;
      const email = u.public_email || u.email;
      if (email) emails.set(id, email);
    } catch {
    }
  }
  const items = take.map((i) => gitlabToItem(i, repo.path, emails));
  if (o.dryRun) {
    for (const it of items)
      o.print(
        [
          `#${/#(\d+)$/.exec(it.externalRef)[1]}`,
          TYPE[it.type],
          it.state === "closed" ? "\u0413\u043E\u0442\u043E\u0432\u043E" : "\u0411\u044D\u043A\u043B\u043E\u0433",
          o.milestones ? it.milestone ?? "\u2014" : "\u2014",
          it.assigneeEmail ?? "\u043E\u0431\u0449\u0430\u044F \u043E\u0447\u0435\u0440\u0435\u0434\u044C",
          cut(it.title, 70)
        ].join(" \xB7 ")
      );
    o.print(`${items.length} ${plural(items.length)} \u0438\u0437 ${repo.path} \u2192 ${o.project} (\u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430, \u043D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043F\u0435\u0440\u0435\u043D\u0435\u0441\u0435\u043D\u043E)`);
    return 0;
  }
  const total = { created: 0, skipped: 0, epics: 0 };
  const runId = randomUUID();
  for (let k = 0; k < items.length; k += IMPORT_LIMITS.batch) {
    const batch = items.slice(k, k + IMPORT_LIMITS.batch);
    const requestId = `import-${runId}-${k / IMPORT_LIMITS.batch}`;
    const res = await fetchImpl(`${creds.server}/api/v1/tracker/agent/projects/${encodeURIComponent(o.project)}/import`, {
      method: "POST",
      headers: { authorization: `Bearer ${creds.token}`, "content-type": "application/json", accept: "application/json", "idempotency-key": requestId },
      body: JSON.stringify({ source: "gitlab", repo: `${repo.origin}/${repo.path}`, items: batch, ...o.milestones ? { milestones: true } : {} }),
      signal: AbortSignal.timeout(6e4)
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      o.print(`\u0422\u0440\u0435\u043A\u0435\u0440 \u043E\u0442\u043A\u0430\u0437\u0430\u043B (${res.status}): ${body?.error?.message ?? "\u0431\u0435\u0437 \u043E\u0431\u044A\u044F\u0441\u043D\u0435\u043D\u0438\u044F"}. \u041F\u0435\u0440\u0435\u043D\u0435\u0441\u0435\u043D\u043E \u0434\u043E \u044D\u0442\u043E\u0433\u043E: ${total.created}`);
      return 1;
    }
    total.created += body?.created ?? 0;
    total.skipped += body?.skipped ?? 0;
    total.epics += body?.epics ?? 0;
  }
  o.print(`\u0413\u043E\u0442\u043E\u0432\u043E: \u0441\u043E\u0437\u0434\u0430\u043D\u043E ${total.created}, \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E ${total.skipped} (\u0443\u0436\u0435 \u0431\u044B\u043B\u0438), \u044D\u043F\u0438\u043A\u043E\u0432 \u0438\u0437 \u0432\u0435\u0445 ${total.epics}`);
  return 0;
}

// ../tracker-domain/src/repoUrl.ts
function normalizeRepoUrl(raw) {
  const s = raw.trim();
  if (!s) return null;
  let host;
  let path;
  const scp = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\d+(?:\/|$))(.+)$/.exec(s);
  if (scp && !s.includes("://")) {
    host = scp[1];
    path = scp[2];
  } else {
    try {
      const u = new URL(s.includes("://") ? s : `https://${s}`);
      host = u.hostname;
      path = u.pathname;
    } catch {
      return null;
    }
  }
  path = path.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  if (!host.includes(".") || /\s/.test(host) || path.split("/").filter(Boolean).length < 2) return null;
  return `${host.toLowerCase()}/${path}`;
}

// src/repos.ts
var short = (path) => path.split("/").pop() ?? path;
var plural2 = (n) => n % 10 === 1 && n % 100 !== 11 ? "\u0440\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u0439" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "\u0440\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u044F" : "\u0440\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u0435\u0432";
async function connectRepos(o, fetchImpl = fetch) {
  const where = parseRepo(o.group ?? o.repo ?? "");
  if (!where) {
    o.print(`\u041D\u0435 \u043F\u043E\u043D\u044F\u043B \u0430\u0434\u0440\u0435\u0441 ${o.group ? "\u0433\u0440\u0443\u043F\u043F\u044B" : "\u0440\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u044F"}: ${o.group ?? o.repo ?? ""}`);
    return 1;
  }
  if (!where.origin.startsWith("https://")) {
    o.print(`GitLab \u2014 \u0442\u043E\u043B\u044C\u043A\u043E https: ${where.origin}`);
    return 1;
  }
  const creds = readCredentials(o.env);
  if (!creds) {
    o.print("\u041D\u0435\u0442 \u0432\u0445\u043E\u0434\u0430 \u0432 \u0442\u0440\u0435\u043A\u0435\u0440 \u2014 \u0432\u044B\u043F\u043E\u043B\u043D\u0438\u0442\u0435 dm-tracker login");
    return 1;
  }
  const token = gitlabTokenFrom(o.env, where.host);
  if (!token) {
    o.print(`\u041D\u0435\u0442 \u0442\u043E\u043A\u0435\u043D\u0430 GitLab \u0434\u043B\u044F ${where.host}: \u0437\u0430\u0434\u0430\u0439\u0442\u0435 GITLAB_TOKEN (scope api, \u043F\u0440\u0430\u0432\u0430 Maintainer \u0432 \u0440\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u044F\u0445) \u0438\u043B\u0438 \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0447\u0435\u0440\u0435\u0437 glab auth login`);
    return 1;
  }
  const gl = async (method, path, body) => {
    const res = await fetchImpl(`${where.origin}/api/v4${path}`, {
      method,
      headers: { "PRIVATE-TOKEN": token, accept: "application/json", ...body ? { "content-type": "application/json" } : {} },
      ...body ? { body: JSON.stringify(body) } : {},
      signal: AbortSignal.timeout(3e4)
    });
    return { status: res.status, data: await res.json().catch(() => null), next: res.headers.get("x-next-page") || null };
  };
  const tr = async (method, path, body) => {
    const res = await fetchImpl(`${creds.server}/api/v1/tracker/agent${path}`, {
      method,
      headers: { authorization: `Bearer ${creds.token}`, accept: "application/json", ...body ? { "content-type": "application/json" } : {} },
      ...body ? { body: JSON.stringify(body) } : {},
      signal: AbortSignal.timeout(3e4)
    });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  const why = (r) => r.data?.error?.message ?? r.data?.message ?? `\u043E\u0442\u0432\u0435\u0442 ${r.status}`;
  const list = [];
  if (o.group) {
    let page = "1";
    while (page) {
      const r = await gl("GET", `/groups/${encodeURIComponent(where.path)}/projects?include_subgroups=${o.subgroups}&archived=false&per_page=100&page=${page}&order_by=path&sort=asc`);
      if (r.status !== 200) {
        o.print(`GitLab \u043D\u0435 \u043E\u0442\u0434\u0430\u043B \u0433\u0440\u0443\u043F\u043F\u0443 ${where.path}: ${why(r)}`);
        return 1;
      }
      list.push(...r.data);
      page = r.next;
    }
  } else {
    const r = await gl("GET", `/projects/${encodeURIComponent(where.path)}`);
    if (r.status !== 200) {
      o.print(`GitLab \u043D\u0435 \u043E\u0442\u0434\u0430\u043B \u0440\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u0439 ${where.path}: ${why(r)}`);
      return 1;
    }
    list.push(r.data);
  }
  const projects = list.filter((p) => !p.archived);
  const known = await tr("GET", `/projects/${encodeURIComponent(o.project)}/repos`);
  if (known.status !== 200) {
    o.print(`\u0422\u0440\u0435\u043A\u0435\u0440 \u043E\u0442\u043A\u0430\u0437\u0430\u043B (${known.status}): ${why(known)}`);
    return 1;
  }
  const byUrl = new Map(known.data.items.map((r) => [r.urlNorm, r]));
  const total = { bound: 0, hooked: 0, skipped: 0, errors: 0 };
  for (const p of projects) {
    const name = short(p.path_with_namespace);
    const norm = normalizeRepoUrl(p.web_url);
    let repo = norm ? byUrl.get(norm) : void 0;
    const branch = p.default_branch || "main";
    if (repo && repo.defaultBranch !== branch) o.print(`${name} \u2014 \u043E\u0441\u043D\u043E\u0432\u043D\u0430\u044F \u0432\u0435\u0442\u043A\u0430 \u0432 \u0442\u0440\u0435\u043A\u0435\u0440\u0435 ${repo.defaultBranch}, \u0432 GitLab ${branch}: \u043F\u043E\u043F\u0440\u0430\u0432\u044C\u0442\u0435 \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445 \u043F\u0440\u043E\u0435\u043A\u0442\u0430`);
    const tracked = !!repo && !!repo.hook && repo.hook.state !== "none";
    let ours;
    if (repo) {
      const hooks = await gl("GET", `/projects/${p.id}/hooks?per_page=100`);
      if (hooks.status !== 200) {
        o.print(`${name} \u2014 \u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C \u0432\u0435\u0431\u0445\u0443\u043A\u0438 GitLab: ${hooks.status}${hooks.status === 403 || hooks.status === 401 ? " \u2014 \u043D\u0443\u0436\u043D\u044B \u043F\u0440\u0430\u0432\u0430 Maintainer \u0432 \u0440\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u0438" : ""}`);
        total.errors++;
        continue;
      }
      const all = hooks.data;
      ours = all.find((h2) => h2.url === `${creds.server}/api/v1/tracker/hooks/gitlab/${repo.id}`);
      const elsewhere = !ours && all.some((h2) => h2.url.endsWith(`/api/v1/tracker/hooks/gitlab/${repo.id}`));
      if (tracked && elsewhere) {
        o.print(`${name} \u2014 \u0432\u0435\u0431\u0445\u0443\u043A \u0443\u0436\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D \u0441 \u0434\u0440\u0443\u0433\u0438\u043C \u0430\u0434\u0440\u0435\u0441\u043E\u043C \u0442\u0440\u0435\u043A\u0435\u0440\u0430: \u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D \u043A\u0430\u043A \u0435\u0441\u0442\u044C (\u043F\u0435\u0440\u0435\u0432\u044B\u043F\u0443\u0441\u043A \u2014 \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445 \u043F\u0440\u043E\u0435\u043A\u0442\u0430)`);
        total.skipped++;
        continue;
      }
    }
    if (tracked && ours && !o.rotate) {
      o.print(`${name} \u2014 \u0443\u0436\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D`);
      total.skipped++;
      continue;
    }
    if (o.dryRun) {
      o.print(`${name} \u2014 ${!repo ? "\u0431\u0443\u0434\u0435\u0442 \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D, \u0432\u0435\u0431\u0445\u0443\u043A \u0431\u0443\u0434\u0435\u0442 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D" : ours ? "\u0432\u0435\u0431\u0445\u0443\u043A \u0431\u0443\u0434\u0435\u0442 \u043F\u0435\u0440\u0435\u0432\u044B\u043F\u0443\u0449\u0435\u043D" : "\u0432\u0435\u0431\u0445\u0443\u043A \u0431\u0443\u0434\u0435\u0442 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D"}`);
      continue;
    }
    const fresh = !repo;
    if (!repo) {
      const r = await tr("POST", `/projects/${encodeURIComponent(o.project)}/repos`, { url: p.web_url, defaultBranch: branch });
      if (r.status !== 200) {
        o.print(`${name} \u2014 \u043D\u0435 \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D: ${why(r)}`);
        total.errors++;
        continue;
      }
      repo = r.data;
      total.bound++;
    }
    const h = await tr("POST", `/repos/${repo.id}/hook`, {});
    if (h.status !== 200) {
      o.print(`${name} \u2014 ${fresh ? "\u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D, " : ""}\u0432\u0435\u0431\u0445\u0443\u043A \u043D\u0435 \u0432\u044B\u043F\u0443\u0449\u0435\u043D: ${why(h)}`);
      total.errors++;
      continue;
    }
    const hook = { url: `${creds.server}${h.data.path}`, token: h.data.secret, push_events: true, merge_requests_events: true, pipeline_events: true, enable_ssl_verification: true };
    const put = ours ? await gl("PUT", `/projects/${p.id}/hooks/${ours.id}`, hook) : await gl("POST", `/projects/${p.id}/hooks`, hook);
    if (put.status >= 300) {
      o.print(`${name} \u2014 \u0441\u0435\u043A\u0440\u0435\u0442 \u0432\u044B\u043F\u0443\u0449\u0435\u043D, \u0432\u0435\u0431\u0445\u0443\u043A \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u043D: GitLab ${put.status}${put.status === 403 || put.status === 401 ? " \u2014 \u043D\u0443\u0436\u043D\u044B \u043F\u0440\u0430\u0432\u0430 Maintainer \u0432 \u0440\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u0438" : ""}`);
      total.errors++;
      continue;
    }
    total.hooked++;
    o.print(`${name} \u2014 ${fresh ? "\u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D, \u0432\u0435\u0431\u0445\u0443\u043A \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D" : ours ? "\u0432\u0435\u0431\u0445\u0443\u043A \u043F\u0435\u0440\u0435\u0432\u044B\u043F\u0443\u0449\u0435\u043D" : "\u0432\u0435\u0431\u0445\u0443\u043A \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D"}`);
  }
  if (o.dryRun) {
    o.print(`${projects.length} ${plural2(projects.length)} \u0438\u0437 ${where.path} \u2192 ${o.project} (\u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430, \u043D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u043E)`);
    return 0;
  }
  o.print(`\u0418\u0442\u043E\u0433\u043E: \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D\u043E ${total.bound}, \u0432\u0435\u0431\u0445\u0443\u043A\u043E\u0432 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E ${total.hooked}, \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E ${total.skipped}, \u043E\u0448\u0438\u0431\u043E\u043A ${total.errors}`);
  return total.errors ? 1 : 0;
}

// src/install.ts
import { cpSync, existsSync as existsSync3, mkdirSync as mkdirSync4, readFileSync as readFileSync5, readdirSync as readdirSync2 } from "node:fs";
import { homedir as homedir4 } from "node:os";
import { join as join5 } from "node:path";
import { fileURLToPath } from "node:url";
var CLIENTS = ["codex", "cursor", "devmachine"];
function installClient(name) {
  if (name === "koder") return "devmachine";
  return CLIENTS.includes(name ?? "") ? name : null;
}
var SKILLS_DIR = (env) => join5(env.HOME || homedir4(), ".agents", "skills");
function assetsRoot() {
  const candidates = [new URL("../", import.meta.url), new URL("../../../plugins/tracker/", import.meta.url)].map((u) => fileURLToPath(u));
  const hit = candidates.find((d) => existsSync3(join5(d, "skills")));
  if (!hit) throw new Error("the tracker skills are not found next to dm-tracker");
  return hit;
}
function mcpSnippet(client, server) {
  const url = `${server}/mcp/tracker`;
  if (client === "codex")
    return `# ~/.codex/config.toml
[mcp_servers.tracker]
url = "${url}"
bearer_token_env_var = "DM_TRACKER_TOKEN"`;
  if (client === "cursor")
    return `// ~/.cursor/mcp.json
{ "mcpServers": { "tracker": { "url": "${url}", "headers": { "Authorization": "Bearer \${env:DM_TRACKER_TOKEN}" } } } }`;
  return `// DevMachine: ~/.koder/engine config, key "mcp"
{ "mcp": { "tracker": { "type": "remote", "url": "${url}", "headers": { "Authorization": "Bearer {env:DM_TRACKER_TOKEN}" } } } }`;
}
function install(client, o) {
  const root = assetsRoot();
  const target = o.dir ?? SKILLS_DIR(o.env);
  mkdirSync4(target, { recursive: true });
  const names = readdirSync2(join5(root, "skills")).filter((n) => existsSync3(join5(root, "skills", n, "SKILL.md")));
  for (const n of names) cpSync(join5(root, "skills", n), join5(target, n), { recursive: true });
  o.print(`\u041D\u0430\u0432\u044B\u043A\u0438 \u0442\u0440\u0435\u043A\u0435\u0440\u0430: ${names.join(", ")} \u2192 ${target}`);
  o.print("");
  o.print("\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 MCP:");
  o.print(mcpSnippet(client, o.server));
  o.print("");
  o.print("\u0422\u043E\u043A\u0435\u043D \u0434\u043B\u044F \u043A\u043B\u0438\u0435\u043D\u0442\u0430 (\u0434\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u0432 \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u043E\u0431\u043E\u043B\u043E\u0447\u043A\u0438):");
  o.print("export DM_TRACKER_TOKEN=$(dm-tracker token)");
  o.print("");
  o.print("\u0411\u043B\u043E\u043A \u0434\u043B\u044F AGENTS.md \u043F\u0440\u043E\u0435\u043A\u0442\u0430:");
  o.print(readFileSync5(join5(root, "universal", "AGENTS.md.snippet"), "utf8"));
  return names;
}

// src/main.ts
var VERSION = true ? "0.1.0" : "dev";
var DEFAULT_SERVER = "https://office.devmachine.ai";
function headersCommand(env) {
  const c = readCredentials(env);
  return c ? JSON.stringify({ Authorization: `Bearer ${c.token}` }) : "{}";
}
var flag = (args, name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : void 0;
};
var openBrowser = (url) => {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true }).on("error", () => void 0).unref();
  } catch {
  }
};
async function doctor(env, print) {
  let ok = true;
  print(`node ${process.version}${Number(process.versions.node.split(".")[0]) >= 18 ? "" : " \u2014 \u043D\u0443\u0436\u0435\u043D Node 18+"}`);
  const c = readCredentials(env);
  if (!c) {
    print("\u0432\u0445\u043E\u0434: \u043D\u0435\u0442 \u2014 \u0432\u044B\u043F\u043E\u043B\u043D\u0438\u0442\u0435 dm-tracker login");
    return 1;
  }
  print(`\u0432\u0445\u043E\u0434: ${c.server}, \u0442\u043E\u043A\u0435\u043D \u0434\u043E ${c.expiresAt.slice(0, 10)}`);
  try {
    await request(`${c.server}/api/v1/tracker/cli-config`, { timeoutMs: 5e3 });
    print("\u0441\u0435\u0440\u0432\u0435\u0440: \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
  } catch (e) {
    ok = false;
    print(`\u0441\u0435\u0440\u0432\u0435\u0440: \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D (${e.message})`);
  }
  const repo = repoOf(process.cwd());
  if (!repo) print("\u0440\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u0439: \u0442\u0435\u043A\u0443\u0449\u0430\u044F \u043F\u0430\u043F\u043A\u0430 \u043D\u0435 git-\u0440\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u0439 \u0441 remote");
  else {
    try {
      const r = await request(`${c.server}/api/v1/tracker/agent/context`, { token: c.token, json: { repoUrl: repo.url, branch: repo.branch }, timeoutMs: 5e3 });
      print(r.project ? `\u0440\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u0439: \u043F\u0440\u043E\u0435\u043A\u0442 ${r.project.key}` : `\u0440\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u0439 ${repo.url} \u043D\u0435 \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D \u043A \u043F\u0440\u043E\u0435\u043A\u0442\u0443 \u2014 \u043F\u043E\u043F\u0440\u043E\u0441\u0438\u0442\u0435 \u0440\u0443\u043A\u043E\u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044F \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0435\u0433\u043E`);
    } catch (e) {
      ok = false;
      print(`\u0440\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u0439: \u043E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 (${e.message})`);
    }
  }
  return ok ? 0 : 1;
}
async function main(argv, env = process.env, print = (s) => process.stdout.write(s + "\n")) {
  const [cmd, ...args] = argv;
  const creds = readCredentials(env);
  const server = (flag(args, "server") ?? env.DM_TRACKER_SERVER ?? creds?.server ?? DEFAULT_SERVER).replace(/\/$/, "");
  switch (cmd) {
    case "headers":
      print(headersCommand(env));
      return 0;
    case "token":
      if (!creds) return 1;
      print(creds.token);
      return 0;
    case "hook": {
      let stdin = "";
      try {
        stdin = process.stdin.isTTY ? "" : readFileSync6(0, "utf8");
      } catch {
      }
      const out = await runHook(args[0] ?? "", stdin, { env });
      if (out) print(out);
      return 0;
    }
    case "login":
      await login({ server, env, print, open: openBrowser, ...flag(args, "name") ? { name: flag(args, "name") } : {}, ...flag(args, "profiles") ? { profiles: flag(args, "profiles").split(",") } : {} });
      return 0;
    case "logout":
      if (creds) await request(`${creds.server}/api/v1/tracker/agent/logout`, { token: creds.token, json: {} }).catch(() => void 0);
      removeCredentials(env);
      print("\u0412\u044B\u0445\u043E\u0434 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D");
      return 0;
    case "install": {
      const client = installClient(flag(args, "client"));
      if (!client) {
        print(`\u0423\u043A\u0430\u0436\u0438\u0442\u0435 --client ${CLIENTS.join("|")}`);
        return 1;
      }
      install(client, { env, server, print, ...flag(args, "dir") ? { dir: flag(args, "dir") } : {} });
      return 0;
    }
    case "doctor":
      return doctor(env, print);
    // dm-tracker import gitlab --project DM --repo <url> [--milestones] [--state opened|all] [--dry-run] (T5)
    case "import": {
      const project = flag(args, "project");
      const repo = flag(args, "repo");
      const state = flag(args, "state") ?? "opened";
      if (args[0] !== "gitlab" || !project || !repo || state !== "opened" && state !== "all") {
        print("dm-tracker import gitlab --project <\u041A\u041B\u042E\u0427> --repo <url> [--milestones] [--state opened|all] [--dry-run]");
        return 1;
      }
      return importGitlab({ project: project.toUpperCase(), repo, milestones: args.includes("--milestones"), state, dryRun: args.includes("--dry-run"), env, print });
    }
    // dm-tracker repos connect --project FAR --group <адрес группы GitLab> | --repo <url> [--no-subgroups] [--rotate] [--dry-run] (T6)
    case "repos": {
      const project = flag(args, "project");
      const group = flag(args, "group");
      const repo = flag(args, "repo");
      if (args[0] !== "connect" || !project || !!group === !!repo) {
        print("dm-tracker repos connect --project <\u041A\u041B\u042E\u0427> --group <\u0430\u0434\u0440\u0435\u0441 \u0433\u0440\u0443\u043F\u043F\u044B GitLab> | --repo <url> [--no-subgroups] [--rotate] [--dry-run]");
        return 1;
      }
      return connectRepos({ project: project.toUpperCase(), ...group ? { group } : {}, ...repo ? { repo } : {}, subgroups: !args.includes("--no-subgroups"), rotate: args.includes("--rotate"), dryRun: args.includes("--dry-run"), env, print });
    }
    case "--version":
    case "version":
      print(VERSION);
      return 0;
    default:
      print("dm-tracker login | logout | doctor | install --client codex|cursor|devmachine | import gitlab --project <\u041A\u041B\u042E\u0427> --repo <url> | repos connect --project <\u041A\u041B\u042E\u0427> --group <url> | headers | token | hook <event> | --version");
      return cmd ? 1 : 0;
  }
}

// src/cli.ts
main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    process.stderr.write(`dm-tracker: ${e.message}
`);
    process.exit(1);
  }
);
