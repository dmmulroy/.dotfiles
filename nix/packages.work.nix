{ pkgs, ... }:

{
  # Work-only CLI packages (mirrors the old packages/bundle.work — empty for now).
  # Import this module from nix/darwin.nix on work machines, or merge into
  # environment.systemPackages there.
  environment.systemPackages = with pkgs; [
  ];
}
