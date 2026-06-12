{ pkgs, ... }:

{
  imports = [
    ./packages.nix
    ./homebrew.nix
  ];

  nixpkgs.hostPlatform = "aarch64-darwin";
  nixpkgs.config.allowUnfree = true;

  # Required now that system activation runs as root: user-scoped options
  # (e.g. the homebrew module) apply to this user.
  system.primaryUser = "ricardoferreira";

  # Determinate manages the Nix installation/daemon itself, so nix-darwin must
  # not. (flakes + nix-command are already enabled system-wide by Determinate.)
  nix.enable = false;

  # Register the nix-provided fish in /etc/shells so it can be the login shell.
  # The actual `chsh` is a manual post-switch step (see plan).
  programs.fish.enable = true;
  environment.shells = [ pkgs.fish ];

  # Used for backwards compatibility — do not change after first switch.
  system.stateVersion = 5;
}
