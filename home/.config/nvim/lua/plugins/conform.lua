vim.api.nvim_create_user_command("ConformDisable", function(args)
	if args.bang then
		-- FormatDisable! will disable formatting just for this buffer
		vim.b.disable_autoformat = true
	else
		vim.g.disable_autoformat = true
	end
end, {
	desc = "Disable conform-autoformat-on-save",
	bang = true,
})

vim.api.nvim_create_user_command("ConformEnable", function()
	vim.b.disable_autoformat = false
	vim.g.disable_autoformat = false
end, {
	desc = "Re-enable conform-autoformat-on-save",
})

return {
	{
		"stevearc/conform.nvim",
		event = { "BufWritePre" },
		cmd = { "ConformInfo" },
		opts = {
			notify_on_error = false,
			default_format_opts = {
				async = true,
				timeout_ms = 500,
				lsp_format = "fallback",
			},
			format_after_save = function(buffer_number)
				if vim.g.disable_autoformat or vim.b[buffer_number].disable_autoformat then
					return
				end
				return {
					async = true,
					timeout_ms = 500,
					lsp_format = "fallback",
				}
			end,
			formatters_by_ft = {
				javascript = { "biome" },
				typescript = { "biome" },
				typescriptreact = { "biome" },
				svelte = { "prettierd", "prettier " },
				lua = { "stylua" },
			},
		},
	},
}
