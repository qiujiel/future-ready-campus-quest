import {
  evaluateBootstrapSnapshot,
  fetchBootstrapSnapshot,
  readBootstrapConfiguration,
} from "./production-bootstrap-preflight-core.mjs";

const configuration = readBootstrapConfiguration(process.env);
const snapshot = await fetchBootstrapSnapshot(configuration);
const evidence = evaluateBootstrapSnapshot(snapshot, configuration);
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
