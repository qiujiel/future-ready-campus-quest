const knownStages = new Set(["find", "preflight", "create", "sign", "complete"]);

export function parseJoinServerTiming(header) {
  if (!header) return {};
  return Object.fromEntries(
    header.split(",").flatMap((entry) => {
      const match = entry.trim().match(/^([a-z]+);dur=([0-9]+(?:\.[0-9]+)?)$/);
      if (!match || !knownStages.has(match[1])) return [];
      const duration = Number(match[2]);
      return Number.isFinite(duration) ? [[match[1], duration]] : [];
    }),
  );
}
