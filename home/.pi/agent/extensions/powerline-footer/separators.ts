import type { SeparatorDef, StatusLineSeparatorStyle } from "./types.js";
import { getSeparatorChars } from "./icons.js";

export function getSeparator(style: StatusLineSeparatorStyle): SeparatorDef {
  const chars = getSeparatorChars();

  switch (style) {
    case "powerline":
      return {
        left: chars.powerlineLeft,
        right: chars.powerlineRight,
        endCaps: {
          left: chars.powerlineRight,
          right: chars.powerlineLeft,
          useBgAsFg: true,
        },
      };

    case "powerline-thin":
      return {
        left: chars.powerlineThinLeft,
        right: chars.powerlineThinRight,
        endCaps: {
          left: chars.powerlineRight,
          right: chars.powerlineLeft,
          useBgAsFg: true,
        },
      };

    case "slash":
      return { left: ` ${chars.slash} `, right: ` ${chars.slash} ` };

    case "pipe":
      return { left: ` ${chars.pipe} `, right: ` ${chars.pipe} ` };

    case "block":
      return { left: chars.block, right: chars.block };

    case "none":
      return { left: chars.space, right: chars.space };

    case "ascii":
      return { left: chars.asciiLeft, right: chars.asciiRight };

    case "dot":
      return { left: chars.dot, right: chars.dot };

    case "chevron":
      return { left: "›", right: "‹" };

    case "star":
      return { left: "✦", right: "✦" };

    default:
      return getSeparator("powerline-thin");
  }
}
