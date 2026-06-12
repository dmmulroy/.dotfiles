{ pkgs, ... }:

{
  # CLI formulas migrated from packages/bundle → native nixpkgs.
  # Sorted by nixpkgs attribute name. `dot package add brew <x>` inserts here.
  # Name remaps from brew: awscli→awscli2, gnu-sed→gnused, jj→jujutsu,
  # tree-sitter-cli→tree-sitter.
  environment.systemPackages = with pkgs; [
    ast-grep
    awscli2
    btop
    cloc
    cmake
    direnv
    doggo
    doppler
    fd
    ffmpeg
    fish
    fzf
    gh
    gnupg
    gnused
    jq
    jujutsu
    just
    lazygit
    neovim
    ripgrep
    shellcheck
    starship
    stow
    stylua
    tailscale
    tree
    tree-sitter
    wasm-tools
    wasmtime
    wget
    zig
    zoxide
  ];
}
