const DEDICATED_LOAD_PROJECT_REF = "vadyhuipwbtgbzpeisbn";

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${name}. Run live load only against the dedicated load-test project.`,
    );
  }
  return value;
}

export function readDedicatedLoadConfiguration(environment) {
  const projectRef = required(environment, "LOAD_SUPABASE_PROJECT_REF");
  const apiUrl = required(environment, "LOAD_SUPABASE_URL");
  let url;
  try {
    url = new URL(apiUrl);
  } catch {
    throw new Error("Live load requires the exact dedicated load-test project URL.");
  }
  if (
    projectRef !== DEDICATED_LOAD_PROJECT_REF ||
    url.protocol !== "https:" ||
    url.hostname !== `${DEDICATED_LOAD_PROJECT_REF}.supabase.co` ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Live load requires the exact dedicated load-test project URL and ref.");
  }
  return {
    projectRef,
    apiUrl,
    publishableKey: required(
      environment,
      "LOAD_SUPABASE_PUBLISHABLE_KEY",
    ),
    secretKey: required(environment, "LOAD_SUPABASE_SECRET_KEY"),
  };
}
