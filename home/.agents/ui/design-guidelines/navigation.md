# Navigation

- Every app must have a mobile navigation menu on small screens, regardless of whether the desktop nav is in a header or sidebar — use a dialog or disclosure panel with a hamburger toggle; hide the desktop nav with `hidden lg:flex` (header) or `hidden lg:block` (sidebar) and show the mobile menu below `lg:`
- Never use a high-contrast or primary-color background for active nav items — use darker text color, a soft/muted background, or both
- Never change `font-weight` between nav item states (default, hover, active) — use color and background changes only
- Horizontal menus (tabs, tab bars, pill navs) must never overflow the parent container — use horizontal scrolling when items don't fit
- Never use icons in top header horizontal navigation links — use text-only links
