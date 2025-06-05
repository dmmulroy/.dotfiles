return {
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

			local vtsls_inlay_hints = {
				enumMemberValues = { enabled = true },
				functionLikeReturnTypes = { enabled = true },
				functionParameterTypes = { enabled = true },
				parameterNames = { enabled = "all" },
				parameterNameWhenArgumentMatchesNames = { enabled = true },
				propertyDeclarationTypes = { enabled = true },
				variableTypes = { enabled = true },
				variableTypeWhenTypeMatchesNames = { enabled = true },
			}

			-- on_attach: call your custom keymap binding function
			local on_attach = function(_client, buffer_number)
				map_lsp_keybinds(buffer_number)
			end

			-- List your LSP servers here.
			local servers = {
				bashls = {},
				biome = {},
				cssls = {},
				gleam = {
					settings = { inlayHints = true },
				},
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
								library = {
									"${3rd}/luv/library",
									unpack(vim.api.nvim_get_runtime_file("", true)),
								},
							},
							telemetry = { enabled = false },
						},
					},
				},
				marksman = {},
				ocamllsp = {
					manual_install = true,
					cmd = { "dune", "exec", "ocamllsp" },
					settings = {
						codelens = { enable = true },
						inlayHints = { enable = true },
						syntaxDocumentation = { enable = true },
					},
				},
				nil_ls = {},
				pyright = {},
				sqlls = {},
				tailwindcss = {
					filetypes = { "typescriptreact", "javascriptreact", "html", "svelte" },
				},
				vtsls = {
					on_attach = function(client, buffer_number)
						require("twoslash-queries").attach(client, buffer_number)
						return on_attach(client, buffer_number)
					end,
					settings = {
						complete_function_calls = true,
						vtsls = {
							autoUseWorkspaceTsdk = true,
							experimental = {
								completion = {
									enableServerSideFuzzyMatch = true,
								},
							},
						},
						typescript = {
							updateImportOnFileMove = { enabled = "always" },
							suggest = {
								completeFunctionCalls = true,
							},
							tsserver = {
								maxTsServerMemory = 12288,
							},
							inlayHints = vtsls_inlay_hints,
						},
						javascript = { inlayHints = vtsls_inlay_hints },
					},
				},
				yamlls = {},
				svelte = {},
				rust_analyzer = {
					check = { command = "clippy", features = "all" },
				},
			}

			local formatters = {
				prettierd = {},
				stylua = {},
			}

			local manually_installed_servers = { "ocamllsp", "gleam", "rust_analyzer" }
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
			capabilities = vim.tbl_deep_extend("force", capabilities, require("cmp_nvim_lsp").default_capabilities())

			-- Setup each LSP server. We merge in any server-specific capabilities by passing
			-- the existing config.capabilities to blink.cmp.get_lsp_capabilities.
			for name, config in pairs(servers) do
				require("lspconfig")[name].setup({
					autostart = config.autostart,
					cmd = config.cmd,
					capabilities = capabilities,
					filetypes = config.filetypes,
					handlers = vim.tbl_deep_extend("force", {}, config.handlers or {}),
					on_attach = config.on_attach or on_attach,
					settings = config.settings,
					root_dir = config.root_dir,
				})
			end

			-- Setup Mason for managing external LSP servers
			require("mason").setup({ ui = { border = "rounded" } })
			require("mason-lspconfig").setup()

			-- Configure borders for LspInfo UI and diagnostics
			require("lspconfig.ui.windows").default_options.border = "rounded"
		end,
	},
}
