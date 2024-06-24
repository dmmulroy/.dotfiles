{
  c = "clear";
  code = "vim";
  dwb = ''darwin-rebuild switch --flake ".#aarch64"'';
  dwc = ''darwin-rebuild check --flake ".#aarch64"'';
  grep = "grep --color=auto --exclude-dir={.bzr,CVS,.git,.hg,.svn,.idea,.tox}";
  ks = "tmux kill-server";
  node-shell = "nix shell nixpkgs#{nodejs_21, typescript, nodePackages.pnpm, bun, fnm} && eval $(fnm env)";
  opam-shell = "nix shell nixpkgs#opam --system aarch64-darwin nixpkgs#dune_3 --system aarch64-darwin nixpkgs#ocaml --system aarch64-darwin";
  pn = "pnpm";
  vi = "vim";
}
