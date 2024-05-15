vim.api.nvim_create_user_command("ToggleESLint", function()
	local eslint_config = require("lspconfig").eslint

	if eslint_config.manager then
		if eslint_config.manager.status == "running" then
			eslint_config.manager.stop()
			vim.notify("ESLint server stopped.")
		else
			eslint_config.manager.start()
			vim.notify("ESLint server started.")
		end
	else
		vim.notify("ESLint server not found or not initialized.")
	end
end, {})
