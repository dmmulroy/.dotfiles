# Shadow Homebrew's version-pinned vendor hook so upgrades do not break running shells.
if command -q direnv
    direnv hook fish | source
end
