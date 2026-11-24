# Scroll direction: natural on the trackpad, traditional on the mouse.
# macOS has one global "natural scrolling" switch, so keep it on and let
# Scroll Reverser (cask in packages/bundle) flip only mouse wheel events.
__define_component scroll_reverser darwin optional "Scroll Reverser"

SCROLL_REVERSER_DOMAIN="com.pilotmoon.scroll-reverser"
SCROLL_REVERSER_APP="/Applications/Scroll Reverser.app"

component_scroll_reverser_install() {
    __setup_scroll_reverser
}

component_scroll_reverser_check() {
    __doctor_check --warn --hint "brew install --cask scroll-reverser" "Scroll Reverser is installed" test -d "$SCROLL_REVERSER_APP"
}

__setup_scroll_reverser() {
    if [[ ! -d "$SCROLL_REVERSER_APP" ]]; then
        __print_warning "Scroll Reverser not installed; skipping (brew install --cask scroll-reverser)"
        return 0
    fi

    # Global natural scrolling on (trackpad stays natural).
    defaults write -g com.apple.swipescrolldirection -bool true

    local key value
    while read -r key value; do
        defaults write "$SCROLL_REVERSER_DOMAIN" "$key" -bool "$value"
    done <<'SETTINGS'
InvertScrollingOn true
ReverseMouse true
ReverseTrackpad false
ReverseTablet false
ReverseY true
ReverseX false
StartAtLogin true
SETTINGS

    # Scroll Reverser reads prefs at launch; restart it to apply.
    if pgrep -xq "Scroll Reverser"; then
        osascript -e 'quit app "Scroll Reverser"' >/dev/null 2>&1 || true
        sleep 1
    fi
    open -g "$SCROLL_REVERSER_APP" || true
    __print_success "Scroll Reverser configured (trackpad natural, mouse traditional)"
    __print_info "Grant Scroll Reverser Accessibility access in System Settings > Privacy & Security if prompted"
}
