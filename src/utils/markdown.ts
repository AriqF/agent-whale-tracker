// Telegram MarkdownV2 requires escaping these chars:
// _ * [ ] ( ) ~ ` > # + - = | { } . !

export function escapeMarkdown(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/** Inline code — tap-friendly monospace block in Telegram (MarkdownV2) */
export function inlineCode(text: string): string {
  const safe = text.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
  return `\`${safe}\``;
}

/** Escape plain text but keep `inline code` segments intact for Telegram */
export function escapeMarkdownPreserveCode(text: string): string {
  const codeBlocks: string[] = [];
  const stripped = text.replace(/`(?:\\.|[^`\\])*`/g, (match) => {
    codeBlocks.push(match);
    return `\x00C${codeBlocks.length - 1}\x00`;
  });
  const escaped = escapeMarkdown(stripped);
  return escaped.replace(/\x00C(\d+)\x00/g, (_, i) => codeBlocks[Number(i)]);
}
