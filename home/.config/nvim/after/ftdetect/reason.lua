-- Detect and set the proper file type for ReasonML files
vim.api.nvim_create_autocmd({ "BufRead", "BufNewFile" }, {
	pattern = "*.re,*.rei",
	desc = "Detect and set the proper file type for ReasonML files",
	callback = function()
		vim.cmd("set filetype=reason")
	end,
})
