{ ... }:

{
  # GUI casks + custom-tap formulas stay on Homebrew, declared here so
  # `darwin-rebuild switch` drives `brew bundle` for them.
  # `dot package add cask <x>` inserts into `casks` below.
  homebrew = {
    enable = true;

    onActivation = {
      # Fully declarative: uninstall (and zap) any cask/brew not listed here.
      # Any intentional brew formula must be declared in `brews` below or
      # migrated to nixpkgs (nix/packages.nix), or it will be removed on switch.
      cleanup = "zap";
      autoUpdate = true;
      upgrade = true;
    };

    taps = [
      "dmmulroy/tap"
      "modem-dev/tap"
    ];

    # Formulas with no nixpkgs equivalent or from custom taps.
    # (fisher is vendored into home/.config/fish/functions/fisher.fish instead —
    # the brew formula pulled in fish as a dependency and its function wasn't
    # visible to the nix fish.)
    brews = [
      "jj-starship" # dmmulroy/tap
      "hunk" # modem-dev/tap
      "herdr"
    ];

    casks = [
      "claude-code@latest"
      "cleanshot"
      "kitty"
      "orbstack"
      "raycast"
      "yaak@beta"
      "zed"
    ];
  };
}
