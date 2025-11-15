return {
	"dmmulroy/ts-error-translator.nvim",
	event = "VeryLazy",
	config = function()
		require("ts-error-translator").setup()
	end,
}
