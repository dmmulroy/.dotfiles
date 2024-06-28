{inputs}: {
  pkgs,
  config,
  ...
}: let
  mono-lisa-font = inputs.self.packages.${pkgs.system}.mono-lisa;
  catppuccin-tmux = inputs.self.packages.${pkgs.system}.catppuccin-tmux;
in {
  # https://mipmip.github.io/home-manager-option-search/

  home.stateVersion = "24.05";

  fonts.fontconfig.enable = true;

  home.packages = with pkgs; [
    fd
    gnused
    mono-lisa-font
    ripgrep
    tree
    wget
    graphite-cli
    gh
  ];

  programs.direnv = {
    enable = true;
    enableZshIntegration = true;
    # enableFishIntegration gets enabled by default when enabling programs.fish
    # enableFishIntegration = true;
    nix-direnv.enable = true;
  };

  programs.fish = {
    enable = true;
    interactiveShellInit = ''
      set fish_greeting # Disable greeting

      ${builtins.readFile ../config/fish/catppuccin_macchiato_theme.fish}
      ${builtins.readFile ../config/fish/graphite.fish}
    '';
    functions = import ../config/fish/functions.nix;
    plugins = [
      {
        name = "z";
        src = pkgs.fishPlugins.z.src;
      }

      {
        name = "plugin-git";
        src = pkgs.fishPlugins.plugin-git.src;
      }
    ];
    shellAliases = import ../config/fish/aliases.nix;
  };

  programs.git = {
    enable = true;
    userEmail = "dillon.mulroy@gmail.com";
    userName = "Dillon Mulroy";
    includes = [
      {
        condition = "gitdir:~/Code/work/";
        contents = {
          user = {
            name = "Dillon Mulroy";
            email = "dillon.mulroy@vercel.com";
          };
        };
      }
    ];
    aliases = {
      fomo = "!fish -c 'git fetch origin $(__git.default_branch) && git rebase origin/$(__git.default_branch) --autostash'";
      lg = "!fish -c 'git_log_n $argv'";
      nuke = "!git add --all && git stash && git stash clear";
    };
    lfs = {
      enable = true;
    };
    extraConfig = {
      branch.sort = "-committerdate";
      column.ui = "auto";
      core = {
        editor = "nvim";
        fsmonitor = true;
      };
      fetch = {
        prune = true;
        writeCommitGraph = true;
      };
      gpg.format = "ssh";
      init.defaultBranch = "main";
      pull.rebase = true;
      rebase.updateRefs = true;
      rerere.enabled = true;
      user.signingkey = "~/.ssh/key.pub";
    };
  };

  programs.fzf = {
    enable = true;
    enableZshIntegration = true;
    enableFishIntegration = true;
    colors = {
      bg = "#24273a";
      "bg+" = "#363a4f";
      spinner = "#f4dbd6";
      hl = "#ed8796";
      fg = "#cad3f5";
      header = "#ed8796";
      info = "#c6a0f6";
      pointer = "#f4dbd6";
      marker = "#f4dbd6";
      "fg+" = "#cad3f5";
      prompt = "#c6a0f6";
      "hl+" = "#ed8796";
    };
    defaultOptions = [
      "--bind ctrl-u:preview-half-page-up,ctrl-d:preview-half-page-down"
      "--preview 'cat {}'"
    ];
  };

  xdg.configFile = {
    ghostty = {
      source = config.lib.file.mkOutOfStoreSymlink ../config/ghostty;
      recursive = true;
    };
  };

  xdg.configFile = {
    nvim = {
      source = config.lib.file.mkOutOfStoreSymlink ../config/nvim;
      recursive = true;
    };
  };

  programs.neovim = {
    enable = true;
    defaultEditor = true;
    extraLuaConfig = ''
      require('user')
    '';
    extraPackages = [
      # Included for nil_ls
      pkgs.cargo
      # Included to build telescope-fzf-native.nvim
      pkgs.cmake
      # Included for LuaSnip
      pkgs.luajitPackages.jsregexp
    ];
    withNodeJs = true;
    withPython3 = true;
    withRuby = true;
    vimdiffAlias = true;
    viAlias = true;
    vimAlias = true;
  };

  programs.starship = {
    enable = true;
    enableZshIntegration = true;
    enableFishIntegration = true;
    settings = {
      buf = {
        disabled = true;
      };
      character = {
        success_symbol = "[󰘧](bold green)";
        error_symbol = "[󰘧](bold red)";
      };
      directory = {
        truncate_to_repo = false;
      };
      dotnet = {
        detect_files = [
          "global.json"
          "Directory.Build.props"
          "Directory.Build.targets"
          "Packages.props"
        ];
      };
      git_branch = {
        symbol = " ";
        truncation_length = 18;
      };
      golang = {
        symbol = " ";
      };
      lua = {
        symbol = " ";
      };
      nix_shell = {
        symbol = " ";
      };
      package = {
        disabled = true;
      };
    };
  };

  programs.tmux = {
    enable = true;
    shell = "${pkgs.fish}/bin/fish";
    terminal = "xterm-256color";
    extraConfig = builtins.readFile ../config/tmux/tmux.conf;
    plugins = [
      pkgs.tmuxPlugins.vim-tmux-navigator

      {
        plugin = catppuccin-tmux;
        extraConfig = builtins.readFile ../config/tmux/catppuccin.conf;
      }

      {
        plugin = pkgs.tmuxPlugins.resurrect;
        extraConfig = ''
          set -g @resurrect-strategy-vim 'session'
          set -g @resurrect-strategy-nvim 'session'
          set -g @resurrect-capture-pane-contents 'on'
        '';
      }

      {
        plugin = pkgs.tmuxPlugins.continuum;
        extraConfig = ''
          set -g @continuum-restore 'on'
          set -g @continuum-boot 'on'
          set -g @continuum-save-interval '10'
        '';
      }
    ];
  };
  programs.zsh = {
    enable = true;
    autosuggestion = {
      enable = true;
    };
    enableCompletion = true;
    initExtra = ''
      ${builtins.readFile ../config/zsh/functions.zsh}
      ${builtins.readFile ../config/zsh/opam.zsh}
    '';
    oh-my-zsh = {
      enable = true;
      plugins = ["git" "z"];
      theme = "robbyrussell";
    };
    shellAliases = {
      "c" = "clear";
      "code" = "vim";
      "dwc" = ''darwin-rebuild check --flake ".#aarch64"'';
      "dwb" = ''darwin-rebuild switch --flake ".#aarch64"'';
      "ks" = "tmux kill-server";
      "node-env" = "nix-shell -p nodejs_21 bun typescript eslint_d prettierd --command zsh";
    };
    syntaxHighlighting = {
      enable = true;
    };
  };
}
