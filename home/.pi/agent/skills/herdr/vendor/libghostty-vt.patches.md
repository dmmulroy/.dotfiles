# libghostty-vt local patches

This file tracks intentional local changes applied on top of the vendored
`libghostty-vt` source. Remove a patch only when the vendored source commit
contains the upstream fix and the listed verification still passes.

## 0001 backport resizeCols cursor subtraction saturation

status: active

patch: `vendor/patches/libghostty-vt/0001-backport-resizecols-cursor-subtraction.patch`

herdr issue: https://github.com/ogulcancelik/herdr/issues/465

upstream discussion: https://github.com/ghostty-org/ghostty/discussions/12905

upstream pr: https://github.com/ghostty-org/ghostty/pull/12907

introduced upstream: `c44afa625`

vendored base: `0f7cd84b880b203c98683e520e84b9db0c5938d8`

local files:

- `vendor/libghostty-vt/src/terminal/PageList.zig`
- `vendor/libghostty-vt/src/terminal/c/terminal.zig`

reason: shrinking rows and columns in one resize can leave the pre-resize
cursor row past the new row count. `PageList.resizeCols` then computed rows
below the cursor with checked unsigned subtraction and aborted in safety builds.

remove when: the vendored source commit contains upstream PR #12907 and the
local ReleaseSafe resize regression tests pass without this patch.

verification:

```sh
zig build test-lib-vt -Demit-lib-vt -Doptimize=ReleaseSafe -Dtest-filter="resize shrinks both axes with cursor at bottom"
zig build test-lib-vt -Demit-lib-vt -Doptimize=ReleaseSafe -Dtest-filter="PageList resize less rows and cols cursor at bottom"
```
