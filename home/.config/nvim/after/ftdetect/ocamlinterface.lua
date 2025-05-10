-- Properly set the file type for ocaml interface files
vim.api.nvim_create_autocmd({ "BufRead", "BufNewFile" }, {
	pattern = "*.mli",
	desc = "Detect and set the proper file type for ocaml interface files",
	callback = function()
		vim.cmd(":set filetype=ocamlinterface")
	end,
})
