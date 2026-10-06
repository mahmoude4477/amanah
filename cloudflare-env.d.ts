declare namespace Cloudflare {
  interface Env {
    BETTER_AUTH_SECRET?: string;
    // Server-side secrets of the AMANAH model endpoint: read only in lib/server, never sent to the browser.
    AMANAH_ML_URL?: string;
    AMANAH_ML_TOKEN?: string;
    AMANAH_ML_TRANSPORT?: string;
    AMANAH_ML_TIMEOUT_MS?: string;
    AMANAH_REVIEWER_EMAILS?: string;
  }
}
