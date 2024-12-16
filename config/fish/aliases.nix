{
  as = "aerospace";
  c = "clear";
  code = "vim";
  dwb = ''darwin-rebuild switch --flake ".#aarch64"'';
  dwc = ''darwin-rebuild check --flake ".#aarch64"'';
  grep = "grep --color=auto --exclude-dir={.bzr,CVS,.git,.hg,.svn,.idea,.tox}";
  ks = "tmux kill-server";
  node-shell = "nix shell nixpkgs#{nodejs, typescript, bun}";
  pn = "pnpm";
}
