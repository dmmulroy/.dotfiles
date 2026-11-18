# Cache starship's init script instead of running `starship init fish | source`
# on every shell start (that forks starship twice and goes through psub).
# The cache key is the resolved binary path (includes the Homebrew Cellar
# version), so upgrades regenerate it automatically.
set -l __starship_bin (command -s starship)
or return

set -l __starship_real (path resolve $__starship_bin)
# $__fish_cache_dir only exists in fish 4+ (Ubuntu 24.04 ships fish 3.7).
set -l __starship_cache_dir $__fish_cache_dir
if test -z "$__starship_cache_dir"
    set -q XDG_CACHE_HOME; and set __starship_cache_dir $XDG_CACHE_HOME/fish; or set __starship_cache_dir $HOME/.cache/fish
end
set -l __starship_cache $__starship_cache_dir/starship_init.fish
set -l __starship_key "# starship-init-cache: $__starship_real"

set -l __starship_cached_key
test -s $__starship_cache; and read __starship_cached_key <$__starship_cache
if test "$__starship_cached_key" != "$__starship_key"
    mkdir -p $__starship_cache_dir
    begin
        echo $__starship_key
        $__starship_bin init fish --print-full-init
    end >$__starship_cache
end
source $__starship_cache
