return {
	"echasnovski/mini.cursorword",
	version = false,
	lazy = true,
	event = "CursorMoved",
	config = function()
		require("mini.cursorword").setup()
	end,
}
