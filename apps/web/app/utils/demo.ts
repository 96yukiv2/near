export type Friend = {
  id: string;
  name: string;
  initial: string;
  color: string;
  place: string;
  updated: string;
  accuracy: string;
  coordinates: [number, number];
  stale?: boolean;
};

// These are fictional locations for the preview, never device location data.
export const friends: Friend[] = [
  {
    id: "yui",
    name: "ゆい",
    initial: "Y",
    color: "#ffad91",
    place: "代々木公園の近く",
    updated: "たった今",
    accuracy: "約 20 m",
    coordinates: [139.694, 35.671],
  },
  {
    id: "sora",
    name: "そら",
    initial: "S",
    color: "#a6c6f8",
    place: "中目黒の近く",
    updated: "5分前",
    accuracy: "約 45 m",
    coordinates: [139.698, 35.644],
  },
  {
    id: "haru",
    name: "はる",
    initial: "H",
    color: "#d0b5ec",
    place: "原宿の近く",
    updated: "2時間前",
    accuracy: "約 120 m",
    coordinates: [139.706, 35.67],
    stale: true,
  },
];

export function statusLabel(friend: Friend): string {
  return friend.stale ? "更新が古い" : "共有中";
}
