import type { FrontmatterDocument } from "../types.ts";

export interface FrontmatterCodec {
  parse(raw: string): FrontmatterDocument;
}

export class SimpleFrontmatterCodec implements FrontmatterCodec {
  parse(raw: string): FrontmatterDocument {
    const lineEnding: "\n" | "\r\n" = raw.includes("\r\n") ? "\r\n" : "\n";
    const opening = raw.match(/^---[ \t]*(\r?\n)/);
    if (!opening) {
      return {
        raw,
        hasFrontmatter: false,
        frontmatterStart: 0,
        frontmatterEnd: 0,
        contentStart: 0,
        frontmatterText: "",
        bodyText: raw,
        fields: {},
        lineEnding,
      };
    }

    const frontmatterStart = opening[0].length;
    const rest = raw.slice(frontmatterStart);
    const closing = /^---[ \t]*(?:\r?\n|$)/m.exec(rest);
    if (!closing || closing.index === undefined) {
      return {
        raw,
        hasFrontmatter: false,
        frontmatterStart: 0,
        frontmatterEnd: 0,
        contentStart: 0,
        frontmatterText: "",
        bodyText: raw,
        fields: {},
        lineEnding,
      };
    }

    const frontmatterEnd = frontmatterStart + closing.index;
    const contentStart = frontmatterEnd + closing[0].length;
    const frontmatterText = raw.slice(frontmatterStart, frontmatterEnd);

    return {
      raw,
      hasFrontmatter: true,
      frontmatterStart,
      frontmatterEnd,
      contentStart,
      frontmatterText,
      bodyText: raw.slice(contentStart),
      fields: parseYamlLikeFields(frontmatterText),
      lineEnding,
    };
  }
}

function parseYamlLikeFields(frontmatterText: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const rawLine of frontmatterText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(rawLine);
    if (!match) continue;
    const key = match[1];
    if (!key) continue;
    fields[key] = parseScalar(match[2] ?? "");
  }
  return fields;
}

function parseScalar(raw: string): unknown {
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
