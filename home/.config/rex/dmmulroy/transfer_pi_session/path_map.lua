-- Pure: where a source path lives on the target. Paths under the source home move
-- under the target home; every other path keeps its place.

local M = {}

local function strip_trailing_slash(path)
	if #path > 1 then
		path = path:gsub("/+$", "")
	end
	return path
end

---@param path string        absolute path on the source
---@param source_home string
---@param target_home string
---@return string
function M.map_path_to_target(path, source_home, target_home)
	path = strip_trailing_slash(path)
	source_home = strip_trailing_slash(source_home)
	target_home = strip_trailing_slash(target_home)
	if path == source_home then
		return target_home
	end
	if path:sub(1, #source_home + 1) == source_home .. "/" then
		return target_home .. path:sub(#source_home + 1)
	end
	return path
end

---Joins a root and a git prefix ("" or "sub/dir/") into a directory path.
---@param root string
---@param prefix string?
---@return string
function M.join_prefix(root, prefix)
	prefix = (prefix or ""):gsub("/+$", "")
	if prefix == "" then
		return root
	end
	return strip_trailing_slash(root) .. "/" .. prefix
end

return M
