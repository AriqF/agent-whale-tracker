// Telegram MarkdownV2 requires escaping these chars:
// _ * [ ] ( ) ~ ` > # + - = | { } . !

export function escapeMarkdown(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}
