import {
  evaluateDisposableStateSnapshot,
  fetchDisposableStateSnapshot,
  readDisposableStateConfiguration,
} from "./production-disposable-state-core.mjs";

const configuration = readDisposableStateConfiguration(process.env);
const snapshot = await fetchDisposableStateSnapshot(configuration);
const evidence = evaluateDisposableStateSnapshot(snapshot, configuration);
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
