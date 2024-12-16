{username}: {
  nixpkgs,
  pkgs,
  lib,
  ...
}: {
  system.stateVersion = 5;

  nix = {
    gc = {
      automatic = true;
      interval = {
        Weekday = 0;
        Hour = 0;
        Minute = 0;
      };
      options = "--delete-older-than 30d";
    };
    optimise = {
      automatic = true;
    };
    settings = {
      builders-use-substitutes = true;
      experimental-features = ["flakes" "nix-command"];
      substituters = ["https://nix-community.cachix.org"];
      trusted-public-keys = [
        "nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
      ];
      trusted-users = ["@wheel"];
      warn-dirty = false;
    };
  };

  security.pam.enableSudoTouchIdAuth = true;

  environment = {
    shells = [pkgs.zsh pkgs.fish];
    systemPackages = [
      pkgs.devenv
    ];
  };

  programs = {
    fish = {
      enable = true;
    };
    zsh = {
      enable = true;
    };
  };

  services.nix-daemon.enable = true;

  users.users.${username} = {
    home = "/Users/${username}";
    shell = pkgs.fish;
  };

  nixpkgs.config.allowUnfreePredicate = pkg:
    builtins.elem (lib.getName pkg) [
      "graphite-cli"
    ];
}
