# Put nix's bin on PATH early. nix-darwin adds it via /etc/fish/config.fish,
# but fish sources that AFTER user conf.d/* — too late for prompt init files
# (starship.fish, zoxide.fish) that call nix-provided tools. The leading "0-"
# makes this sort first so the rest of conf.d sees the nix tools.
if test -d /run/current-system/sw/bin
    fish_add_path --global --prepend /run/current-system/sw/bin
end
