-- "Transfer pi Session to Host…": moves the pi session in a pane to another Rex
-- host. This file is only the entry point: it chooses the pane and the host, then
-- starts the worker (run.lua) in a floating pane, because a transfer outlasts an
-- action's 30 seconds and its progress should be visible.
--
-- Run it from the palette, from a key, from pi with /transfer [host], or:
--   rex do transfer_pi_session host=exe-dev-box
--
-- See README.md beside this file for how the transfer works.

local pi_sidecar = require("dmmulroy.transfer_pi_session.pi_sidecar")

local WORKER_SCRIPT = os.getenv("HOME") .. "/.config/rex/dmmulroy/transfer_pi_session/run.lua"
local SHELL_FLAVOR = "com.superlogical.terminal.shell"
-- x, y, width, height as fractions of the window.
local WORKER_PANE_BOUNDS = { 0.15, 0.2, 0.7, 0.6 }

-- sh: runs the worker; a failure stays on screen until Enter, a success for a moment.
local WORKER_WRAPPER = [[
"$@"
code=$?
if [ "$code" -ne 0 ]; then
  printf '\nPress Enter to close. '
  read -r _
else
  sleep 3
fi
]]

-- Actions run in the server's environment, which may not have rex on PATH.
local function rex_cli_path()
	local bin_dir = os.getenv("REX_BIN_DIR")
	if bin_dir and bin_dir ~= "" then
		return bin_dir .. "/rex"
	end
	return "rex"
end

local function fail(message)
	error("transfer pi session: " .. message, 0)
end

---The blocks of the session that have a pi sidecar, with the window each is in.
local function find_pi_blocks()
	local found = {}
	local result = rex.session.list_blocks({})
	for _, block in ipairs((result and result.blocks) or {}) do
		local sidecar = pi_sidecar.read_sidecar(block.block_id)
		if sidecar then
			table.insert(found, { block_id = block.block_id, window_id = block.window_id, label = block.label, sidecar = sidecar })
		end
	end
	return found
end

---The pane to transfer: the one named, else the focused one if pi runs there,
---else the session's only pi pane, else the person's choice.
local function choose_pi_block(ctx, args)
	local pi_blocks = find_pi_blocks()
	local wanted = args.block_id or ctx.block_id
	for _, block in ipairs(pi_blocks) do
		if block.block_id == wanted then
			return block
		end
	end
	if args.block_id then
		fail("no pi session is known for " .. args.block_id)
	end
	if #pi_blocks == 0 then
		fail("no pane in this session runs pi with the rex-transfer extension loaded (run /reload in pi)")
	end
	if #pi_blocks == 1 then
		return pi_blocks[1]
	end

	local items = {}
	for _, block in ipairs(pi_blocks) do
		table.insert(items, {
			id = block.block_id,
			title = block.label ~= "" and block.label or "pi",
			subtitle = block.sidecar.cwd,
			icon = "terminal",
		})
	end
	local chosen = rex.ui.pick({ title = "Transfer which pi session?", items = items })
	if chosen == nil then
		return nil
	end
	for _, block in ipairs(pi_blocks) do
		if block.block_id == chosen then
			return block
		end
	end
end

local function choose_host(args)
	if args.host then
		return args.host
	end
	local labels = rex.servers()
	if #labels == 0 then
		fail("no other Rex hosts; add one with `rex hosts add LABEL ssh://USER@HOST`")
	end
	local items = {}
	for _, label in ipairs(labels) do
		table.insert(items, { id = label, title = label, icon = "server" })
	end
	return rex.ui.pick({ title = "Transfer pi session to", placeholder = "Filter hosts", items = items })
end

local function transfer_pi_session(ctx, args)
	local block = choose_pi_block(ctx, args)
	if not block then
		return
	end
	local host = choose_host(args)
	if not host then
		return
	end

	local command = { "sh", "-c", WORKER_WRAPPER, "transfer-pi-session", rex_cli_path(), "do", WORKER_SCRIPT }
	table.insert(command, "block_id=" .. block.block_id)
	table.insert(command, "host=" .. host)
	for _, flag in ipairs({ "dry_run", "keep_source", "fresh" }) do
		if args[flag] then
			table.insert(command, flag .. "=true")
		end
	end

	local layer, err = rex.session.new_layer({
		window_id = block.window_id,
		bounds = WORKER_PANE_BOUNDS,
		focus = true,
		layout = rex.layout.block({ flavor = SHELL_FLAVOR, options = { command = command } }),
	})
	if layer == nil then
		fail("can't open the transfer pane: " .. tostring(err))
	end
	return { block_id = block.block_id, host = host }
end

rex.action({
	name = "transfer_pi_session",
	title = "Transfer pi Session to Host…",
	description = "Move the pi session in this pane, with its working tree, to another Rex host",
	category = "Agents",
	keywords = "pi agent transfer move handoff teleport remote host ssh session",
	args = {
		host = "string?",
		block_id = "string?",
		dry_run = "boolean?",
		keep_source = "boolean?",
		fresh = "boolean?",
	},
	run = transfer_pi_session,
})
