-- Create a command 'sft' as a proxy for ':setfiletype'
vim.api.nvim_create_user_command("SFT", function(opts)
	vim.cmd("setfiletype " .. opts.args)
end, {
	nargs = 1, -- Expect exactly one argument
	complete = "filetype", -- Provide filetype completion
	desc = "Proxy command for setfiletype",
})
