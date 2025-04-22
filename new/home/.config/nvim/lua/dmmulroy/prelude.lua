local M = {}

--- Returns the current cursor position.
--- @param opts? { zero_indexed?: boolean } Optional. A table of options with the following field:
---        zero_indexed (boolean): if true, the returned row will be 0-indexed.
--- @return { row: integer, col: integer } A table with keys `row` and `col`.
local function get_cursor_position(opts)
	opts = opts or {}
	local zero_indexed = opts.zero_indexed or false

	-- Get the current window's cursor position.
	-- vim.api.nvim_win_get_cursor returns a table with { row, col }
	local pos = vim.api.nvim_win_get_cursor(0)

	if zero_indexed then
		-- Adjust the row to be 0-indexed.
		return { row = pos[1] - 1, col = pos[2] }
	else
		return { row = pos[1], col = pos[2] }
	end
end

M.get_cursor_position = get_cursor_position

return M
