const RECOVERY_ARTIFACT = [
  /\.age$/i,
  /\.(?:backup|dump)$/i,
  /(^|\/)(?:roles|schema|data|history_schema|history_data)\.sql$/i,
  /(^|\/)(?:storage|recovery)-manifest\.json$/i,
  /(^|\/)recovery-(?:package|backup)(\/|$)/i,
];

export function forbiddenRecoveryArtifactPaths(paths) {
  return [...new Set(paths)].filter((path) =>
    RECOVERY_ARTIFACT.some((pattern) => pattern.test(path))
  ).sort();
}
