export const profileIcons = [
  { id: "sun", symbol: "☀️", label: "たいよう", color: "#ffd870" },
  { id: "moon", symbol: "🌙", label: "おつきさま", color: "#c6c3fa" },
  { id: "flower", symbol: "🌼", label: "おはな", color: "#ffd3df" },
  { id: "cat", symbol: "🐱", label: "ねこ", color: "#ffd4a8" },
  { id: "dog", symbol: "🐶", label: "いぬ", color: "#f8d2a7" },
  { id: "frog", symbol: "🐸", label: "かえる", color: "#bce8b3" },
  { id: "bear", symbol: "🐻", label: "くま", color: "#efc9a8" },
  { id: "star", symbol: "⭐", label: "ほし", color: "#ffe495" },
] as const;
export type ProfileIcon = (typeof profileIcons)[number]["id"];
export function getProfileIcon(id: unknown) {
  return profileIcons.find((icon) => icon.id === id) ?? profileIcons[0];
}
