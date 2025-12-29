vim.api.nvim_create_user_command("SetColumnWidth80", function()
	vim.opt.colorcolumn = "80"
end, {})

vim.api.nvim_create_user_command("SetColumnWidth100", function()
	vim.opt.colorcolumn = "100"
end, {})
