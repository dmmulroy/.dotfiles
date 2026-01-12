return {
	{
		"folke/lazydev.nvim",
		ft = "lua",
		opts = {
			library = {
				{ path = "${3rd}/luv/library", words = { "vim%.uv" } },
			},
		},
	},
	{
		"neovim/nvim-lspconfig",
		event = { "BufReadPost" },
		cmd = { "LspInfo", "LspInstall", "LspUninstall", "Mason" },
		dependencies = {
			-- LSP installer plugins
			"williamboman/mason.nvim",
			"williamboman/mason-lspconfig.nvim",
			"WhoIsSethDaniel/mason-tool-installer.nvim",
			-- Integrate blink w/ LSP
			"hrsh7th/cmp-nvim-lsp",
			-- Progress indicator for LSP
			{ "j-hui/fidget.nvim" },
		},
		config = function()
			local map_lsp_keybinds = require("dmmulroy.keymaps").map_lsp_keybinds

			-- List your LSP servers here.
			local servers = {
				bashls = {},
				biome = {},
				cssls = {},
				eslint = {
					autostart = false,
					cmd = { "vscode-eslint-language-server", "--stdio", "--max-old-space-size=12288" },
					settings = { format = false },
				},
				html = {},
				jsonls = {},
				lua_ls = {
					settings = {
						Lua = {
							runtime = { version = "LuaJIT" },
							workspace = {
								checkThirdParty = false,
							},
							telemetry = { enabled = false },
						},
					},
				},
				marksman = {},
				oxlint = {
					root_markers = { ".oxlintrc.json" },
				},
				ocamllsp = {
					manual_install = true,
					cmd = { "dune", "exec", "ocamllsp" },
					settings = {
						codelens = { enable = true },
						inlayHints = { enable = true },
						syntaxDocumentation = { enable = true },
					},
				},
				sqls = {},
				tailwindcss = {
					filetypes = { "typescriptreact", "javascriptreact", "html", "svelte", "astro" },
				},
				yamlls = {},
				svelte = {},
				rust_analyzer = {
					settings = {
						["rust-analyzer"] = {
							check = { command = "clippy", features = "all" },
						},
					},
				},
			}

			local formatters = {
				prettierd = {},
				stylua = {},
			}

			local manually_installed_servers = { "ocamllsp" }
			local mason_tools_to_install = vim.tbl_keys(vim.tbl_deep_extend("force", {}, servers, formatters))
			local ensure_installed = vim.tbl_filter(function(name)
				return not vim.tbl_contains(manually_installed_servers, name)
			end, mason_tools_to_install)

			require("mason-tool-installer").setup({
				auto_update = true,
				run_on_start = true,
				start_delay = 3000,
				debounce_hours = 12,
				ensure_installed = ensure_installed,
			})

			-- LSP servers and clients are able to communicate to each other what features they support.
			--  By default, Neovim doesn't support everything that is in the LSP specification.
			--  When you add nvim-cmp, luasnip, etc. Neovim now has *more* capabilities.
			--  So, we create new capabilities with nvim cmp, and then broadcast that to the servers.
			local capabilities = vim.lsp.protocol.make_client_capabilities()
			-- Use Blink.cmp capabilities if available, fallback to cmp_nvim_lsp
			local has_blink, blink = pcall(require, "blink.cmp")
			if has_blink then
				capabilities = vim.tbl_deep_extend("force", capabilities, blink.get_lsp_capabilities())
			else
				local has_cmp, cmp_lsp = pcall(require, "cmp_nvim_lsp")
				if has_cmp then
					capabilities = vim.tbl_deep_extend("force", capabilities, cmp_lsp.default_capabilities())
				end
			end

			-- Setup LspAttach autocmd for keybindings (replaces on_attach)
			vim.api.nvim_create_autocmd("LspAttach", {
				group = vim.api.nvim_create_augroup("lsp-attach", { clear = true }),
				callback = function(event)
					local bufnr = event.buf
					local bufname = vim.api.nvim_buf_get_name(bufnr)

					-- Detach from non-file buffers (diffview, fugitive, etc.)
					if bufname == "" or bufname:match("^diffview://") or bufname:match("^fugitive://") then
						vim.schedule(function()
							vim.lsp.buf_detach_client(bufnr, event.data.client_id)
						end)
						return
					end

					map_lsp_keybinds(bufnr)
				end,
			})

			-- Setup each LSP server using the new vim.lsp.config API
			for name, config in pairs(servers) do
				-- Configure the server
				vim.lsp.config(name, {
					cmd = config.cmd,
					capabilities = capabilities,
					filetypes = config.filetypes,
					settings = config.settings,
					root_dir = config.root_dir,
					root_markers = config.root_markers,
				})

				-- Enable the server (with autostart setting if specified)
				if config.autostart == false then
					-- Don't auto-enable servers with autostart = false
					-- Users can manually enable with :lua vim.lsp.enable(name)
				else
					vim.lsp.enable(name)
				end
			end

			-- Setup Mason for managing external LSP servers
			require("mason").setup({ ui = { border = "rounded" } })
			require("mason-lspconfig").setup()
		end,
	},
}
