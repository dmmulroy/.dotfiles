-- Register various ocaml related syntax extensions
vim.filetype.add({
	extension = {
		mli = "ocaml.interface",
		mly = "ocaml.menhir",
		mll = "ocaml.ocamllex",
		mlx = "ocaml",
		t = "ocaml.cram",
	},
})

-- If you have `ocaml_interface` parser installed, it will use it for `ocaml.interface` files
vim.treesitter.language.register("ocaml_interface", "ocaml.interface")
vim.treesitter.language.register("menhir", "ocaml.menhir")
vim.treesitter.language.register("ocaml_interface", "ocaml.interface")
vim.treesitter.language.register("cram", "ocaml.cram")
vim.treesitter.language.register("ocamllex", "ocaml.ocamllex")
