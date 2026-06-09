export function getAllowedChatIds(): number[] {
  const raw = process.env.ALLOWED_CHAT_IDS?.trim();
  if (!raw) return [];
  return raw.split(',').map((id) => Number(id.trim())).filter(Boolean);
}

export function isChatAllowed(chatId: number): boolean {
  const allowed = getAllowedChatIds();
  if (allowed.length === 0) return true;
  return allowed.includes(chatId);
}
