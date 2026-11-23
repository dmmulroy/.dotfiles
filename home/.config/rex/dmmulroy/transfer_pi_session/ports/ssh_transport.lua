-- Transport port: run a sh script on a host and copy a file to it. Local hosts run
-- `sh`; remote hosts go through the system `ssh`/`scp`, so your keys, agent and
-- ~/.ssh/config apply. The only transport today; a host without an ssh:// endpoint
-- can't be a target.

local shell = require("shell")

local M = {}

local DEFAULT_TIMEOUT_SECONDS = 120
-- Never ask a question: the worker has nobody to answer it.
local SSH_OPTIONS = { "-o", "BatchMode=yes", "-o", "ConnectTimeout=10" }

---Parses `ssh://[USER@]HOST[:PORT][/SOCKET]`. Returns nil for any other address.
---@param endpoint string
---@return TransferSsh?
function M.parse_ssh_endpoint(endpoint)
	local rest = endpoint:match("^ssh://(.+)$")
	if not rest then
		return nil
	end
	local authority = rest:match("^([^/]+)")
	if not authority then
		return nil
	end
	local dest, port = authority:match("^(.-):(%d+)$")
	if dest then
		return { dest = dest, port = tonumber(port) }
	end
	return { dest = authority }
end

---The git URL of a directory on a host.
---@param host TransferHost
---@param path string  absolute
---@return string
function M.git_url(host, path)
	if host.is_local then
		return path
	end
	local port = host.ssh.port and (":" .. host.ssh.port) or ""
	return "ssh://" .. host.ssh.dest .. port .. path
end

---What git should use as ssh, so pushes never prompt either.
function M.git_ssh_command()
	return "ssh " .. table.concat(SSH_OPTIONS, " ")
end

---How rsync should name a directory on a host: its `-e` remote shell (nil for a
---local host) and the destination argument.
---@param host TransferHost
---@param path string
---@return string? remote_shell
---@return string destination
function M.rsync_destination(host, path)
	if host.is_local then
		return nil, path
	end
	local remote_shell = M.git_ssh_command()
	if host.ssh.port then
		remote_shell = remote_shell .. " -p " .. host.ssh.port
	end
	return remote_shell, host.ssh.dest .. ":" .. path
end

local function append_all(list, items)
	for _, item in ipairs(items) do
		table.insert(list, item)
	end
end

---Runs a sh script on a host. Returns rex.exec's result; raises only when the
---command couldn't start.
---@param host TransferHost
---@param script string
---@param opts { timeout: integer? }?
---@return { ok: boolean, code: integer, stdout: string, stderr: string, timed_out: boolean }
function M.run_script(host, script, opts)
	local argv
	if host.is_local then
		argv = { "sh", "-s" }
	else
		argv = { "ssh" }
		append_all(argv, SSH_OPTIONS)
		if host.ssh.port then
			append_all(argv, { "-p", tostring(host.ssh.port) })
		end
		append_all(argv, { host.ssh.dest, "sh -s" })
	end
	local result, err = rex.exec(argv, {
		stdin = script,
		timeout = (opts and opts.timeout) or DEFAULT_TIMEOUT_SECONDS,
	})
	if not result then
		error("can't run a command on " .. host.label .. ": " .. tostring(err), 0)
	end
	return result
end

---Runs a script that must succeed; raises with its stderr otherwise. Returns stdout.
---@param host TransferHost
---@param script string
---@param what string  what the script does, for the error message
---@param opts { timeout: integer? }?
---@return string stdout
function M.must_run_script(host, script, what, opts)
	local result = M.run_script(host, script, opts)
	if not result.ok then
		local detail = result.timed_out and "timed out" or (result.stderr ~= "" and result.stderr or result.stdout)
		error(what .. " failed on " .. host.label .. ": " .. detail:gsub("%s+$", ""), 0)
	end
	return result.stdout
end

---The SHA-256 of a file on a host, or nil when the file isn't there.
---@param host TransferHost
---@param path string
---@return string?
function M.file_sha256(host, path)
	local result = M.run_script(
		host,
		shell.script({ FILE = path }, { "FILE" }, [[
[ -f "$FILE" ] || exit 3
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$FILE" | cut -d' ' -f1
else
  shasum -a 256 "$FILE" | cut -d' ' -f1
fi
]])
	)
	if not result.ok then
		return nil
	end
	local digest = shell.trim(result.stdout)
	return digest:match("^%x+$") and digest or nil
end

---Copies a local file to a path on a host. The parent directory must exist.
---@param host TransferHost
---@param local_path string
---@param remote_path string
function M.put_file(host, local_path, remote_path)
	local argv
	if host.is_local then
		argv = { "cp", local_path, remote_path }
	else
		argv = { "scp", "-q" }
		append_all(argv, SSH_OPTIONS)
		if host.ssh.port then
			append_all(argv, { "-P", tostring(host.ssh.port) })
		end
		append_all(argv, { local_path, host.ssh.dest .. ":" .. remote_path })
	end
	local result, err = rex.exec(argv, { timeout = 600 })
	if not result then
		error("can't copy to " .. host.label .. ": " .. tostring(err), 0)
	end
	if not result.ok then
		error("copying " .. local_path .. " to " .. host.label .. " failed: " .. result.stderr:gsub("%s+$", ""), 0)
	end
end

return M
