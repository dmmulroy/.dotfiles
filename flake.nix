{
  description = "ricardoferreira dotfiles — nix-darwin package management (incremental)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    nix-darwin.url = "github:nix-darwin/nix-darwin/master";
    nix-darwin.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs =
    { self, nixpkgs, nix-darwin }:
    {
      darwinConfigurations."PT-RICARDOFERREIRA" = nix-darwin.lib.darwinSystem {
        system = "aarch64-darwin";
        modules = [ ./nix/darwin.nix ];
      };

      darwinPackages = self.darwinConfigurations."PT-RICARDOFERREIRA".pkgs;
    };
}
