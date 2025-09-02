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

local function copy_line_diagnostics_to_clipboard()
	-- Get the current buffer and cursor position
	local bufnr = vim.api.nvim_get_current_buf()
	local line = get_cursor_position({ zero_indexed = true }).row

	-- Get diagnostics for the current line
	local diagnostics = vim.diagnostic.get(bufnr, { lnum = line })

	if #diagnostics == 0 then
		print("No diagnostics on the current line.")
		Snacks.notify.info("No diagnostics on the current line.")
		return
	end

	-- Format diagnostics into a single string
	local diagnostic_messages = {}
	for _, diagnostic in ipairs(diagnostics) do
		table.insert(diagnostic_messages, diagnostic.message)
	end
	local result = table.concat(diagnostic_messages, "\n")

	-- Copy the result to the system clipboard
	vim.fn.setreg("+", result)
	Snacks.notify.info("Diagnostics copied to clipboard.")
end

M.copy_line_diagnostics_to_clipboard = copy_line_diagnostics_to_clipboard

local function open_link()
	local line = vim.fn.getline(".")
	local col = vim.fn.col(".")

	-- Pattern for markdown links: [text](url)
	local md_link_pattern = "%[.-%]%((.-)%)"
	-- Pattern for bare URLs (simplified, covers most cases)
	local url_pattern = "https?://[%w-_%.%?%.:/%+=&]+"

	-- Check if cursor is on a markdown link
	local start_pos = 1
	while true do
		local md_start, md_end, url = line:find(md_link_pattern, start_pos)
		if not md_start then
			break
		end

		if col >= md_start and col <= md_end then
			vim.fn.system("open " .. vim.fn.shellescape(url))
			return
		end
		start_pos = md_end + 1
	end

	-- Check for URLs (including those in parentheses)
	start_pos = 1
	while true do
		local url_start, url_end = line:find(url_pattern, start_pos)
		if not url_start then
			break
		end

		if col >= url_start and col <= url_end then
			local url = line:sub(url_start, url_end)
			vim.fn.system("open " .. vim.fn.shellescape(url))
			return
		end
		start_pos = url_end + 1
	end

	-- Fallback to original behavior using cWORD
	vim.cmd("sil !open <cWORD>")
end

M.open_link = open_link

return M
