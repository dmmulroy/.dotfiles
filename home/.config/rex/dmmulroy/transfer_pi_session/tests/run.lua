-- Unit tests for the pure parts of transfer_pi_session. They use fake ports and an
-- in-memory file system, so nothing is transferred and no host is contacted.
--
--   rex do ~/.config/rex/dmmulroy/transfer_pi_session/tests/run.lua
--
-- Exits 1 if any test fails. tests/e2e.sh covers the ports against a real host.

-- `rex do` puts this script's folder on package.path; the modules are one level up.
local tests_dir = package.path:match("([^;]*/tests)/%?%.lua")
if not tests_dir then
	error("can't find the tests folder in package.path: " .. package.path, 0)
end
package.path = tests_dir .. "/../?.lua;" .. package.path

local shell = require("shell")
local path_map = require("path_map")
local journal_module = require("journal")
local runner = require("runner")
local plan_module = require("plan")
local steps_module = require("steps")
local pi_agent = require("ports.pi_agent")
local ssh_transport = require("ports.ssh_transport")

-- Counters live in a table: under `rex do`, a top-level local that closures
-- update can read stale at the top level in a long script.
local results = { passed = 0, failed = {} }

local function test(name, fn)
	local ok, err = pcall(fn)
	if ok then
		results.passed = results.passed + 1
	else
		table.insert(results.failed, name .. ": " .. tostring(err))
	end
end

local function equal(actual, expected, what)
	if actual ~= expected then
		error((what or "value") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual), 2)
	end
end

local function raises(fn, pattern)
	local ok, err = pcall(fn)
	if ok then
		error("expected an error matching " .. pattern, 2)
	end
	if not tostring(err):find(pattern) then
		error("error " .. tostring(err) .. " doesn't match " .. pattern, 2)
	end
end

-- ---------------------------------------------------------------------------
-- shell, path_map, small pure functions
-- ---------------------------------------------------------------------------

test("shell.quote survives single quotes", function()
	equal(shell.quote("it's"), [['it'\''s']])
end)

test("shell.script assigns every named variable, missing ones as empty", function()
	local script = shell.script({ A = "x y" }, { "A", "B" }, "echo hi")
	equal(script, "set -eu\nA='x y'\nB=''\necho hi\n")
end)

test("shell.parse_key_values keeps '=' inside values and skips noise", function()
	local info = shell.parse_key_values("root=/a=b\nnoise\nempty=\n")
	equal(info.root, "/a=b")
	equal(info.empty, "")
	equal(info.noise, nil)
end)

test("path_map moves paths under the source home", function()
	equal(path_map.map_path_to_target("/Users/me/src/app", "/Users/me", "/home/dev"), "/home/dev/src/app")
	equal(path_map.map_path_to_target("/Users/me", "/Users/me/", "/home/dev"), "/home/dev")
end)

test("path_map leaves other paths, including look-alike prefixes", function()
	equal(path_map.map_path_to_target("/tmp/x", "/Users/me", "/home/dev"), "/tmp/x")
	equal(path_map.map_path_to_target("/Users/meow/x", "/Users/me", "/home/dev"), "/Users/meow/x")
end)

test("path_map.join_prefix handles git's trailing slash", function()
	equal(path_map.join_prefix("/r", ""), "/r")
	equal(path_map.join_prefix("/r", "a/b/"), "/r/a/b")
end)

test("ssh endpoints parse with and without user, port and socket", function()
	equal(ssh_transport.parse_ssh_endpoint("ssh://dev@box").dest, "dev@box")
	local with_port = ssh_transport.parse_ssh_endpoint("ssh://dev@box:2222/run/rex.sock")
	equal(with_port.dest, "dev@box")
	equal(with_port.port, 2222)
	equal(ssh_transport.parse_ssh_endpoint("https://box.ts.net"), nil)
end)

test("git_url includes the port", function()
	local host = { is_local = false, ssh = { dest = "dev@box", port = 2222 } }
	equal(ssh_transport.git_url(host, "/home/dev/app"), "ssh://dev@box:2222/home/dev/app")
end)

test("pi is at rest when idle, done or error, and not while working or blocked", function()
	equal(pi_agent.is_at_rest({ { effective_app = "pi", state = "idle" } }), true)
	equal(pi_agent.is_at_rest({ { effective_app = "pi", state = "done" } }), true)
	equal(pi_agent.is_at_rest({ { effective_app = "pi", state = "working" } }), false)
	equal(pi_agent.is_at_rest({ { effective_app = "pi", state = "blocked" } }), false)
	equal(pi_agent.is_at_rest({ { effective_app = "cargo", state = "idle" } }), false)
	equal(pi_agent.is_at_rest(nil), false)
end)

test("pi versions compare numerically", function()
	equal(pi_agent.compare_versions("1.10.0", "1.9.9"), 1)
	equal(pi_agent.compare_versions("1.6.0", "1.6.0"), 0)
	equal(pi_agent.compare_versions("1.5.9", "1.6.0"), -1)
end)

-- ---------------------------------------------------------------------------
-- journal and runner
-- ---------------------------------------------------------------------------

local function memory_fs()
	local files = {}
	return {
		files = files,
		mkdirp = function() end,
		read = function(path)
			return files[path]
		end,
		write_atomic = function(path, text)
			files[path] = text
		end,
		list = function(dir)
			local names = {}
			for path in pairs(files) do
				local name = path:match("^" .. dir:gsub("%p", "%%%0") .. "/([^/]+)$")
				if name then
					table.insert(names, name)
				end
			end
			return names
		end,
	}
end

local function new_store(fs)
	return journal_module.new(fs or memory_fs(), rex.json, function()
		return "2026-01-01T00:00:00Z"
	end, "/journal")
end

local function sample_plan(transfer_id)
	return {
		transfer_id = transfer_id or "20260101T000000Z-abc",
		session = { id = "s1", block_id = "block:1", rex_session_id = "session:1", file = "/s.jsonl" },
		source = { label = "local", is_local = true },
		target = { label = "box" },
		workspace = { kind = "fake" },
		keep_source = false,
	}
end

test("journal round-trips a plan, step status and outputs", function()
	local store = new_store()
	local journal = store.create(sample_plan())
	store.mark_step(journal, "quiesce", "done", { output = { transcript_bytes = 10 } })
	local loaded = store.load(journal.plan.transfer_id)
	equal(loaded.steps.quiesce.status, "done")
	equal(loaded.outputs.quiesce.transcript_bytes, 10)
	equal(loaded.status, "running")
end)

test("journal finds the newest unfinished transfer for the same session, pane and host", function()
	local store = new_store()
	store.set_status(store.create(sample_plan("20260101T000000Z-abc")), "done")
	store.create(sample_plan("20260102T000000Z-abc"))
	store.create(sample_plan("20260103T000000Z-abc"))
	equal(store.find_resumable("s1", "block:1", "box").plan.transfer_id, "20260103T000000Z-abc")
	equal(store.find_resumable("s1", "block:1", "other"), nil)
	equal(store.find_resumable("s2", "block:1", "box"), nil)
end)

test("journal ignores files of another version", function()
	local fs = memory_fs()
	fs.files["/journal/old.json"] = '{"version":0,"plan":{}}'
	equal(new_store(fs).load("old"), nil)
end)

---Steps that record what ran; `fail_at` raises in that step's run.
local function counting_steps(world, fail_at)
	local steps = {}
	for _, name in ipairs({ "a", "b", "c" }) do
		table.insert(steps, {
			name = name,
			title = name,
			done = function()
				return world[name] == true
			end,
			run = function()
				if name == fail_at then
					error("boom", 0)
				end
				world[name] = true
				table.insert(world.ran, name)
				return { by = name }
			end,
		})
	end
	return steps
end

test("runner runs every step once and marks the journal done", function()
	local store, world = new_store(), { ran = {} }
	local journal = store.create(sample_plan())
	local ok = runner.run_steps(counting_steps(world), journal, store, function() end)
	equal(ok, true)
	equal(table.concat(world.ran, ","), "a,b,c")
	equal(journal.status, "done")
	equal(journal.outputs.b.by, "b")
end)

test("runner stops at a failure, records it, and a rerun resumes after the finished steps", function()
	local store, world = new_store(), { ran = {} }
	local journal = store.create(sample_plan())
	local ok, failed_step, err = runner.run_steps(counting_steps(world, "b"), journal, store, function() end)
	equal(ok, false)
	equal(failed_step, "b")
	equal(err, "boom")
	equal(journal.status, "failed")
	equal(journal.steps.b.error, "boom")
	equal(journal.steps.c, nil)

	local resumed = store.load(journal.plan.transfer_id)
	equal(runner.run_steps(counting_steps(world), resumed, store, function() end), true)
	equal(table.concat(world.ran, ","), "a,b,c", "a must not run twice")
	equal(resumed.steps.a.status, "skipped")
	equal(resumed.outputs.a.by, "a", "a skipped step keeps its output")
end)

test("runner treats a probe that raises as a failure, not as 'not done'", function()
	local store = new_store()
	local journal = store.create(sample_plan())
	local ran = false
	local steps = {
		{
			name = "a",
			title = "a",
			done = function()
				error("network down", 0)
			end,
			run = function()
				ran = true
			end,
		},
	}
	local ok, failed_step = runner.run_steps(steps, journal, store, function() end)
	equal(ok, false)
	equal(failed_step, "a")
	equal(ran, false)
end)

-- ---------------------------------------------------------------------------
-- plan and steps, with fake ports
-- ---------------------------------------------------------------------------

---Fake ports describing a healthy source and target. Tests override fields.
local function fake_ports()
	local ports = { calls = {} }
	ports.agent = {
		AGENT_NAME = "pi",
		SUPPORTED_SESSION_VERSION = 3,
		locate_session = function(block_id)
			return {
				agent = "pi",
				id = "01a208e2-ab8b",
				file = "/Users/me/.pi/s.jsonl",
				cwd = "/Users/me/src/app/pkg",
				block_id = block_id,
				rex_session_id = "session:1",
				pid = 42,
			}
		end,
		read_session_header = function()
			return { id = "01a208e2-ab8b", cwd = "/Users/me/src/app/pkg", version = 3 }
		end,
		installed_version = function()
			return "1.6.0"
		end,
		compare_versions = pi_agent.compare_versions,
		is_at_rest = pi_agent.is_at_rest,
		is_running = pi_agent.is_running,
		transcript_size = function()
			return ports.transcript_bytes
		end,
		resume_command = function(path)
			return { "pi", "--fork", path }
		end,
	}
	ports.transcript_bytes = 100
	ports.source_status = { { effective_app = "pi", state = "idle" } }
	ports.rex = {
		terminal_process = function()
			return { foreground_pid = 42, exited = false }
		end,
		find_host = function(label)
			return label == "box" and { label = "box", endpoints = { "https://box.ts.net", "ssh://dev@box" } } or nil
		end,
		server_version = function()
			return { api_revision = 19 }
		end,
		session_label = function()
			return "app"
		end,
		program_status = function(host)
			return host.is_local and ports.source_status or { { effective_app = "pi", state = "idle" } }
		end,
		block_exists = function()
			return true
		end,
		run_in_new_window = function()
			table.insert(ports.calls, "run_in_new_window")
			return { session_id = "session:t", window_id = "window:t", block_id = "block:t" }
		end,
		show_session_in_app = function()
			return true
		end,
		close_block = function()
			table.insert(ports.calls, "close_block")
		end,
	}
	ports.transport = {
		parse_ssh_endpoint = ssh_transport.parse_ssh_endpoint,
		must_run_script = function()
			return "home=/home/dev\nname=box\n"
		end,
		run_script = function()
			return { ok = true, stdout = "", stderr = "" }
		end,
		file_sha256 = function(host)
			if host.is_local or ports.transcript_copied then
				return "abc123"
			end
			return nil
		end,
		put_file = function()
			ports.transcript_copied = true
			table.insert(ports.calls, "put_file")
		end,
	}
	local fake_workspace = {
		inspect_source = function()
			return { kind = "git", root = "/Users/me/src/app", prefix = "pkg/", head = "abcdef1234567890", branch = "main" }
		end,
		check_target = function()
			return ports.target_problems or {}
		end,
		is_snapshot_current = function(_, _, snapshot)
			return snapshot ~= nil
		end,
		snapshot = function()
			return { commit = "c1", tree = "t1" }
		end,
		is_shipped = function()
			return false
		end,
		ship = function()
			table.insert(ports.calls, "ship")
		end,
		is_restored = function()
			return false
		end,
		restore = function()
			table.insert(ports.calls, "restore")
		end,
		cleanup = function()
			table.insert(ports.calls, "cleanup")
		end,
	}
	ports.workspaces = { git = fake_workspace, plain = fake_workspace }
	return ports
end

local function fake_env()
	return {
		home = "/Users/me",
		hostname = "mbp",
		timestamp_id = function()
			return "20260101T000000Z"
		end,
		now = function()
			return "2026-01-01T00:00:00Z"
		end,
		sleep = function() end,
		log = function() end,
	}
end

local PLAN_INPUT = { block_id = "block:1", session_id = "session:1", target_label = "box" }

test("plan maps the repository and cwd under the target's home", function()
	local plan = plan_module.build_plan(fake_ports(), fake_env(), PLAN_INPUT)
	equal(plan.target_root, "/home/dev/src/app")
	equal(plan.target_cwd, "/home/dev/src/app/pkg")
	equal(plan.target.ssh.dest, "dev@box")
	equal(plan.transfer_id, "20260101T000000Z-01a208e2")
	equal(plan.ref, "refs/pi-transfer/20260101T000000Z-01a208e2")
	equal(plan.target_transcript, "/home/dev/.local/state/pi-transfer/transcripts/20260101T000000Z-01a208e2.jsonl")
	equal(plan.session_label, "app")
	equal(plan.keep_source, false)
end)

test("plan refuses a stale sidecar", function()
	local ports = fake_ports()
	ports.rex.terminal_process = function()
		return { foreground_pid = 7, exited = false }
	end
	raises(function()
		plan_module.build_plan(ports, fake_env(), PLAN_INPUT)
	end, "not the foreground program")
end)

test("plan refuses an unknown host and a host without ssh", function()
	raises(function()
		plan_module.build_plan(fake_ports(), fake_env(), { block_id = "block:1", target_label = "nope" })
	end, "no Rex host labeled")
	local ports = fake_ports()
	ports.rex.find_host = function()
		return { label = "box", endpoints = { "https://box.ts.net" } }
	end
	raises(function()
		plan_module.build_plan(ports, fake_env(), PLAN_INPUT)
	end, "no ssh:// endpoint")
end)

test("plan refuses a newer session file format", function()
	local ports = fake_ports()
	ports.agent.read_session_header = function()
		return { id = "01a208e2-ab8b", version = 4 }
	end
	raises(function()
		plan_module.build_plan(ports, fake_env(), PLAN_INPUT)
	end, "newer than this extension understands")
end)

test("plan reports every problem at once: old pi and a dirty target", function()
	local ports = fake_ports()
	ports.agent.installed_version = function(_, host)
		return host.is_local and "1.6.0" or "1.5.0"
	end
	ports.target_problems = { "box:/home/dev/src/app has uncommitted changes" }
	raises(function()
		plan_module.build_plan(ports, fake_env(), PLAN_INPUT)
	end, "older than 1.6.0.*uncommitted changes")
end)

test("plan warns, without failing, when the target's pi is newer", function()
	local ports = fake_ports()
	ports.agent.installed_version = function(_, host)
		return host.is_local and "1.6.0" or "1.7.0"
	end
	local plan = plan_module.build_plan(ports, fake_env(), PLAN_INPUT)
	equal(#plan.warnings, 1)
end)

local function run_transfer(ports, plan_overrides)
	local store = new_store()
	local plan = plan_module.build_plan(ports, fake_env(), PLAN_INPUT)
	for key, value in pairs(plan_overrides or {}) do
		plan[key] = value
	end
	local journal = store.create(plan)
	local ok, failed_step, err = runner.run_steps(steps_module.build_steps(ports, fake_env()), journal, store, function() end)
	return ok, failed_step, err, journal
end

test("a healthy transfer ships, restores, starts pi, closes the source, cleans up", function()
	local ports = fake_ports()
	local ok, _, err, journal = run_transfer(ports)
	equal(ok, true, tostring(err))
	equal(table.concat(ports.calls, ","), "ship,put_file,restore,run_in_new_window,close_block,cleanup")
	equal(journal.outputs.handover.closed, true)
end)

test("the source stays open when it changed after it was captured", function()
	local ports = fake_ports()
	ports.rex.run_in_new_window = function()
		ports.transcript_bytes = 250 -- the person kept talking to the source
		return { session_id = "session:t", window_id = "window:t", block_id = "block:t" }
	end
	local ok, failed_step, err = run_transfer(ports)
	equal(ok, false)
	equal(failed_step, "handover")
	if not err:find("changed after it was captured") then
		error("unexpected error: " .. err)
	end
	for _, call in ipairs(ports.calls) do
		if call == "close_block" then
			error("the source was closed")
		end
	end
end)

test("a rerun replaces a tab whose pi exited, instead of trusting it", function()
	local ports = fake_ports()
	ports.target_exited = true -- on `ports`, not a local: see `results` above
	ports.rex.program_status = function(host)
		if host.is_local then
			return ports.source_status
		end
		return ports.target_exited and {} or { { effective_app = "pi", state = "idle" } }
	end
	ports.rex.terminal_process = function(host)
		if host.is_local then
			return { foreground_pid = 42, exited = false }
		end
		return { exited = ports.target_exited, exit_code = ports.target_exited and 1 or nil }
	end
	local store = new_store()
	local journal = store.create(plan_module.build_plan(ports, fake_env(), PLAN_INPUT))
	local steps = steps_module.build_steps(ports, fake_env())
	local ok, failed_step = runner.run_steps(steps, journal, store, function() end)
	equal(ok, false)
	equal(failed_step, "verify_agent")

	ports.rex.run_in_new_window = function()
		ports.target_exited = false -- the cause was fixed; the new pi stays up
		table.insert(ports.calls, "run_in_new_window")
		return { session_id = "session:t", window_id = "window:t2", block_id = "block:t2" }
	end
	ports.calls = {}
	local resumed_ok, _, resumed_err = runner.run_steps(steps, journal, store, function() end)
	equal(resumed_ok, true, tostring(resumed_err))
	equal(table.concat(ports.calls, ","), "ship,restore,close_block,run_in_new_window,close_block,cleanup")
	equal(journal.outputs.start_agent.block_id, "block:t2")
end)

test("keep_source never closes the source", function()
	local ports = fake_ports()
	local ok, _, _, journal = run_transfer(ports, { keep_source = true })
	equal(ok, true)
	equal(journal.outputs.handover.closed, false)
end)

test("quiesce gives up when pi never comes to rest", function()
	local ports = fake_ports()
	ports.source_status = { { effective_app = "pi", state = "working" } }
	local ok, failed_step, err = run_transfer(ports)
	equal(ok, false)
	equal(failed_step, "quiesce")
	if not err:find("still working") then
		error("unexpected error: " .. err)
	end
end)

test("a pi that exits on the target fails verification and leaves the source alone", function()
	local ports = fake_ports()
	ports.rex.program_status = function(host)
		return host.is_local and ports.source_status or {}
	end
	ports.rex.terminal_process = function(host)
		if host.is_local then
			return { foreground_pid = 42, exited = false }
		end
		return { exited = true, exit_code = 1 }
	end
	local ok, failed_step, err = run_transfer(ports)
	equal(ok, false)
	equal(failed_step, "verify_agent")
	if not err:find("exited on the target") then
		error("unexpected error: " .. err)
	end
end)

-- ---------------------------------------------------------------------------

print(results.passed .. " passed, " .. #results.failed .. " failed")
for _, message in ipairs(results.failed) do
	print("FAIL " .. message)
end
if #results.failed > 0 then
	rex.stop(1)
end
