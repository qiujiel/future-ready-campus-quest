import { assertLocalSupabaseUrl } from "../../scripts/bootstrap-local-classroom";

it.each([
  "http://127.0.0.1:54321",
  "http://localhost:54321",
  "https://[::1]:54321",
])("accepts an explicitly local Supabase URL: %s", (url) => {
  expect(assertLocalSupabaseUrl(url).hostname).toMatch(/127\.0\.0\.1|localhost|\[::1\]/);
});

it.each([
  "https://ghohuwwjxgjqnbsauvzq.supabase.co",
  "https://vadyhuipwbtgbzpeisbn.supabase.co",
  "https://example.com",
])("refuses any hosted project during local bootstrap: %s", (url) => {
  expect(() => assertLocalSupabaseUrl(url)).toThrow(/refuses non-local/i);
});
