# Cache starship's init script instead of running `starship init fish | source`
# on every shell start (that forks starship twice and goes through psub).
# The cache key is the resolved binary path (includes the Homebrew Cellar
# version), so upgrades regenerate it automatically.
set -l __starship_bin (command -s starship)
or return

set -l __starship_real (path resolve $__starship_bin)
set -l __starship_cache $__fish_cache_dir/starship_init.fish
set -l __starship_key "# starship-init-cache: $__starship_real"

set -l __starship_cached_key
test -s $__starship_cache; and read __starship_cached_key <$__starship_cache
if test "$__starship_cached_key" != "$__starship_key"
    mkdir -p $__fish_cache_dir
    begin
        echo $__starship_key
        $__starship_bin init fish --print-full-init
    end >$__starship_cache
end
source $__starship_cache
