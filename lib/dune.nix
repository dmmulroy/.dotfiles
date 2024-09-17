{
  mkDerivation
}:
mkDerivation {
  pluginName = "dune";
  version = "0.0.1.dmmulroy-fork";
  src = fetchFromGitHub {
    owner = "dmmulroy";
    repo = "catppuccin-tmux";
    rev = "ec8df6268a6e5271c693ea34fc545000cec1fced";
    sha256 = "sha256-I8rAg3ecLxW4emtY1VpKpUMIaXfSks416LLkHtLZSsI=";
  };
}

