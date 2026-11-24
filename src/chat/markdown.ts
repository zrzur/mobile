/**
 * A small, fast parser for the message text Zrzur sends: enough to show
 * messages the way the web app does, without a heavy markdown library.
 *
 * Blocks: ```code```, > quote, plain lines.
 * Inline: **bold**, *italic* / _italic_, __underline__, ~~strike~~, `code`,
 * ||spoiler||, <@user>, <@&role>, <#channel>, :custom emoji id:, links.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "bold" | "italic" | "underline" | "strike" | "spoiler"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "user"; id: string }
  | { t: "role"; id: string }
  | { t: "channel"; id: string }
  | { t: "emoji"; id: string }
  | { t: "link"; url: string; label?: string };

export type Block =
  | { t: "para"; c: Inline[] }
  | { t: "quote"; c: Inline[] }
  | { t: "codeblock"; lang?: string; v: string };

const PAIRS: [string, "bold" | "underline" | "strike" | "spoiler" | "italic"][] = [
  ["**", "bold"],
  ["__", "underline"],
  ["~~", "strike"],
  ["||", "spoiler"],
  ["*", "italic"],
  ["_", "italic"],
];

const TOKEN =
  /<@&([0-9A-Z]{26})>|<@([0-9A-Z]{26})>|<#([0-9A-Z]{26})>|:([0-9A-Z]{26}):|\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/;

/** Parse one line (or quote body) into inline pieces */
export function parseInline(text: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) out.push({ t: "text", v: buffer });
    buffer = "";
  };
  let i = 0;
  while (i < text.length) {
    // inline code wins over everything inside it
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ t: "code", v: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "\\" && i + 1 < text.length && /[*_~|`\\<:[]/.test(text[i + 1])) {
      buffer += text[i + 1];
      i += 2;
      continue;
    }
    let matched = false;
    if (depth < 4) {
      for (const [mark, kind] of PAIRS) {
        if (!text.startsWith(mark, i)) continue;
        const end = text.indexOf(mark, i + mark.length);
        // a pair needs text between the marks, and no space right inside them
        if (end <= i + mark.length) continue;
        const inner = text.slice(i + mark.length, end);
        if (/^\s|\s$/.test(inner)) continue;
        // `_` inside words (snake_case) is not italic
        if (mark === "_" && (/\w/.test(text[i - 1] ?? "") || /\w/.test(text[end + 1] ?? ""))) continue;
        flush();
        out.push({ t: kind, c: parseInline(inner, depth + 1) });
        i = end + mark.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const rest = text.slice(i);
    const m = TOKEN.exec(rest);
    if (m && m.index === 0) {
      flush();
      if (m[1]) out.push({ t: "role", id: m[1] });
      else if (m[2]) out.push({ t: "user", id: m[2] });
      else if (m[3]) out.push({ t: "channel", id: m[3] });
      else if (m[4]) out.push({ t: "emoji", id: m[4] });
      else if (m[5] && m[6]) out.push({ t: "link", url: m[6], label: m[5] });
      else if (m[7]) out.push({ t: "link", url: m[7] });
      i += m[0].length;
      continue;
    }
    buffer += text[i];
    i++;
  }
  flush();
  return out;
}

/** Split a message into blocks */
export function parseMessage(content: string): Block[] {
  const blocks: Block[] = [];
  const fence = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const pushText = (text: string) => {
    if (!text) return;
    const lines = text.split("\n");
    let para: string[] = [];
    const flushPara = () => {
      if (para.length) blocks.push({ t: "para", c: parseInline(para.join("\n")) });
      para = [];
    };
    for (const line of lines) {
      const quote = /^>\s?(.*)$/.exec(line);
      if (quote) {
        flushPara();
        blocks.push({ t: "quote", c: parseInline(quote[1]) });
      } else {
        para.push(line);
      }
    }
    flushPara();
  };
  while ((m = fence.exec(content))) {
    pushText(content.slice(last, m.index).replace(/\n$/, ""));
    blocks.push({ t: "codeblock", lang: m[1] || undefined, v: m[2].replace(/\n$/, "") });
    last = m.index + m[0].length;
  }
  pushText(content.slice(last).replace(/^\n/, ""));
  return blocks;
}

/** Whether a message is only emoji (shown bigger, like the web) */
export function isEmojiOnly(blocks: Block[]): boolean {
  if (blocks.length !== 1 || blocks[0].t !== "para") return false;
  const pieces = blocks[0].c.filter((p) => !(p.t === "text" && !p.v.trim()));
  if (pieces.length === 0 || pieces.length > 6) return false;
  return pieces.every(
    (p) => p.t === "emoji" || (p.t === "text" && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|\s)+$/u.test(p.v)),
  );
}
