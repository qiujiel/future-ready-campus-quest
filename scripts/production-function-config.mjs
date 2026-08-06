import { readProductionFunctionConfiguration } from "./production-preflight-core.mjs";

readProductionFunctionConfiguration(process.env);
process.stdout.write("Production Function configuration passed.\n");
