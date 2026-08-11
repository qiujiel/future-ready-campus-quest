import {
  runDisposableStatePreflight,
} from "./production-disposable-state-core.mjs";

await runDisposableStatePreflight(process.env);
