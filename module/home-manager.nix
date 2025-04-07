{inputs}: {
  pkgs,
  config,
  ...
}: let
  mono-lisa-font = inputs.self.packages.${pkgs.system}.mono-lisa;
  catppuccin-tmux = inputs.self.packages.${pkgs.system}.catppuccin-tmux;
in {
  # https://mipmip.github.io/home-manager-option-search/

  home.stateVersion = "24.11";

  fonts.fontconfig.enable = true;

  home.packages = with pkgs; [
    bun
    doggo
    fd
    gh
    gnused
    graphite-cli
    mono-lisa-font
    nodejs_20
    ripgrep
    tree
    wget
  ];

  programs.gpg.enable = true;

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

      set -gx PATH "/Users/dmmulroy/.local/state/fnm_multishells/55214_1743969053185/bin" $PATH;
      set -gx FNM_MULTISHELL_PATH "/Users/dmmulroy/.local/state/fnm_multishells/55214_1743969053185";
      set -gx FNM_VERSION_FILE_STRATEGY "local";
      set -gx FNM_DIR "/Users/dmmulroy/Library/Application Support/fnm";
      set -gx FNM_LOGLEVEL "info";
      set -gx FNM_NODE_DIST_MIRROR "https://nodejs.org/dist";
      set -gx FNM_COREPACK_ENABLED "false";
      set -gx FNM_RESOLVE_ENGINES "true";
      set -gx FNM_ARCH "arm64";
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
    signing = {
      signByDefault = true;
      key = "~/.ssh/key.pub";
    };
    includes = [
      {
        condition = "gitdir:~/Code/work/";
        contents = {
          user = {
            name = "Dillon Mulroy";
            email = "dillon.mulroy@vercel.com";
            signingkey = "~/.ssh/key.pub";
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
      user.signingkey = "~/.ssh/key.pub";
      gpg.format = "ssh";
      init.defaultBranch = "main";
      pull.rebase = true;
      rebase.updateRefs = true;
      rerere.enabled = true;
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

  home.file = {
    ".ideavimrc" = {
      source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/kickstart.nix/config/jetbrains/.ideavimrc";
    };
    ".aider.conf.yml" = {
      source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/kickstart.nix/config/aider/.aider.conf.yml";
    };
  };

  xdg.configFile = {
    dune = {
      source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/kickstart.nix/config/dune";
    };
    ghostty = {
      source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/kickstart.nix/config/ghostty";
    };
    nvim = {
      source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/kickstart.nix/config/nvim";
    };
  };

  programs.neovim = {
    enable = true;
    defaultEditor = true;
    extraPackages = [
      # Included for nil_ls
      pkgs.cargo
      # Included to build telescope-fzf-native.nvim
      pkgs.cmake
      # Included for LuaSnip
      # pkgs.luajitPackages.jsregexp
      pkgs.lua54Packages.jsregexp
      # Included for conform
      pkgs.nodejs
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
    terminal = "tmux-256color";
    sensibleOnTop = true;
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
}
