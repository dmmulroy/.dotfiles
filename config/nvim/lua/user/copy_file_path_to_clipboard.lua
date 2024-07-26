local Path = require("plenary.path")

vim.api.nvim_create_user_command("CopyFilePathToClipboard", function()
	-- Get the current buffer's file path
	local file_path = vim.api.nvim_buf_get_name(0)

	-- Create a Path object for the current directory and get the parent directory
	local project_root_parent_dir = Path:new(vim.fn.getcwd()):parent():absolute()

	-- Create a Path object for the file
	local path_obj = Path:new(file_path)

	-- Get the relative path from the project root
	local relative_path = path_obj:make_relative(project_root_parent_dir)

	-- Copy the relative path to the system clipboard
	vim.fn.setreg("+", relative_path)
end, {})

vim.api.nvim_create_user_command("CFP", function()
	vim.cmd(":CopyFilePathToClipboard")
end, {})
