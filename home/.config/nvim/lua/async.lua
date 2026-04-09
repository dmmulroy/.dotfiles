local lazy_dir = vim.fn.stdpath("data") .. "/lazy"

local function load_module_file(path)
	local chunk, err = loadfile(path)
	if not chunk then
		error(("Failed to load async shim dependency at %s: %s"):format(path, err), 2)
	end
	return chunk()
end

-- Both nvim-ufo and vcsigns require a top-level `async` module, but they
-- expect different implementations:
--   - nvim-ufo -> kevinhwang91/promise-async
--   - vcsigns  -> lewis6991/async.nvim
--
-- Provide a tiny compatibility shim that exposes the promise-async callable
-- API while forwarding structured-concurrency helpers like `run()` and
-- `wrap()` to async.nvim.
local promise_async = load_module_file(lazy_dir .. "/promise-async/lua/async.lua")
local structured_async = load_module_file(lazy_dir .. "/async.nvim/lua/async.lua")

return setmetatable({
	_id = promise_async._id,
	sync = promise_async.sync,
	wait = promise_async.wait,
}, {
	__call = function(_, ...)
		return promise_async(...)
	end,
	__index = function(_, key)
		local value = structured_async[key]
		if value ~= nil then
			return value
		end
		return promise_async[key]
	end,
})
