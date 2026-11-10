export function canSendBackgroundLocation(
  owner: string | null,
  sessionUser: string | undefined,
  timestamp: number,
  accuracy: number | null,
  now: number,
) {
  return (
    !!owner &&
    owner === sessionUser &&
    Number.isFinite(timestamp) &&
    timestamp <= now &&
    now - timestamp <= 5 * 60_000 &&
    accuracy !== null &&
    Number.isFinite(accuracy) &&
    accuracy >= 0 &&
    accuracy <= 100000
  );
}
