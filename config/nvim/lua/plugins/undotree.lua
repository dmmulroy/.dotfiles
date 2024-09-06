return {
	{
		"mbbill/undotree",
		event = { "BufReadPost" },
		lazy = true,
		config = function()
			if vim.fn.has("persistent_undo") == 1 then
				local target_path = vim.fn.expand("~/.undodir")
				if vim.fn.isdirectory(target_path) == 0 then
					vim.fn.mkdir(target_path, "p", 0700)
				end
				vim.opt.undodir = target_path
				vim.opt.undofile = true
			end
		end,
	},
}
