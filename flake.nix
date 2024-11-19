{
  description = "Kickstart Nix on macOS for Dillon Mulroy (dmmulroy)";

  inputs = {
    darwin.inputs.nixpkgs.follows = "nixpkgs";
    darwin.url = "github:lnl7/nix-darwin";
    home-manager.inputs.nixpkgs.follows = "nixpkgs";
    home-manager.url = "github:nix-community/home-manager";
    # nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.05";
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
  };
  outputs = inputs @ {
    self,
    darwin,
    home-manager,
    nixpkgs,
    flake-parts,
    ...
  }: let
    darwin-system = import ./system/darwin.nix {inherit inputs username;};
    username = "dmmulroy";
  in
    flake-parts.lib.mkFlake {inherit inputs;} {
      systems = ["aarch64-darwin"];
      flake = {
        darwinConfigurations = {
          aarch64 = darwin-system "aarch64-darwin";
        };

        lib = import ./lib {inherit inputs;};
      };
      perSystem = {
        config,
        pkgs,
        system,
        ...
      }: {
        formatter = pkgs.alejandra;

        packages = {
          mono-lisa = self.lib.mono-lisa {inherit (pkgs) stdenvNoCC;};
          catppuccin-tmux = self.lib.catppuccin-tmux {
            inherit (pkgs.tmuxPlugins) mkTmuxPlugin;
            inherit (pkgs) fetchFromGitHub;
          };
        };
      };
    };
}
