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
				astro = { "oxfmt", "biome", "prettierd", stop_after_first = true },
				javascript = { "oxfmt", "biome", "prettierd", stop_after_first = true },
				typescript = { "oxfmt", "biome", "prettierd", stop_after_first = true },
				typescriptreact = { "oxfmt", "biome", "prettierd", stop_after_first = true },
				svelte = { "oxfmt", "prettierd", stop_after_first = true },
				lua = { "stylua" },
			},
			formatters = {
				oxfmt = {
					condition = function(_, ctx)
						return vim.fs.find({ ".oxfmtrc.json", ".oxfmtrc.jsonc" }, {
							path = ctx.filename,
							upward = true,
							stop = vim.uv.os_homedir(),
						})[1] ~= nil
					end,
				},
				biome = {
					condition = function(_, ctx)
						return vim.fs.find({ "biome.json", "biome.jsonc" }, {
							path = ctx.filename,
							upward = true,
							stop = vim.uv.os_homedir(),
						})[1] ~= nil
					end,
				},
				prettierd = {
					condition = function(_, ctx)
						return vim.fs.find({
							".prettierrc",
							".prettierrc.json",
							".prettierrc.js",
							".prettierrc.cjs",
							".prettierrc.mjs",
							"prettier.config.js",
							"prettier.config.cjs",
							"prettier.config.mjs",
						}, {
							path = ctx.filename,
							upward = true,
							stop = vim.uv.os_homedir(),
						})[1] ~= nil
					end,
				},
			},
		},
	},
}
