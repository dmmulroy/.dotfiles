return {
	dir = "/Users/dmmulroy/Code/personal/ts-error-translator.nvim",
	config = function()
		require("ts-error-translator").setup({
			auto_attach = true,
		})
	end,
}
