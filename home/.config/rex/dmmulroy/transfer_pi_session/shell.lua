-- Pure helpers for building POSIX sh scripts and reading their output.
-- Scripts are sent on stdin to `sh -s` (locally or over ssh), so values are
-- embedded as quoted assignments, never spliced into a command line.

local M = {}

---@param value string
---@return string
function M.quote(value)
	return "'" .. tostring(value):gsub("'", "'\\''") .. "'"
end

---A script that fails on the first error, with `vars` assigned at the top.
---@param vars table<string, string|number|nil>  nil and absent both become ""
---@param names string[]  every variable the body reads, so a missing one is "" and not unset
---@param body string
---@return string
function M.script(vars, names, body)
	local lines = { "set -eu" }
	for _, name in ipairs(names) do
		local value = vars[name]
		if value == nil then
			value = ""
		end
		table.insert(lines, name .. "=" .. M.quote(tostring(value)))
	end
	table.insert(lines, body)
	return table.concat(lines, "\n") .. "\n"
end

---Reads `key=value` lines, as the scripts print them. Other lines are ignored.
---@param text string
---@return table<string, string>
function M.parse_key_values(text)
	local result = {}
	for line in (text or ""):gmatch("[^\r\n]+") do
		local key, value = line:match("^([%w_]+)=(.*)$")
		if key then
			result[key] = value
		end
	end
	return result
end

---@param text string?
---@return string
function M.trim(text)
	return ((text or ""):gsub("^%s+", ""):gsub("%s+$", ""))
end

return M
