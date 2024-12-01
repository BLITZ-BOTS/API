/* all data must be imported from .env (not from files, its a safer and better practice.) */

interface Env {
  SUPABASE_JWT_SECRET: string;
  SUPABASE_KEY: string;
  SUPABASE_URL: string;
  GITHUB_INSTALLATION_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_APP_ID: string;
  GITHUB_ORG: string;
}

const {
  SUPABASE_JWT_SECRET,
  SUPABASE_KEY,
  SUPABASE_URL,
  GITHUB_INSTALLATION_ID,
  GITHUB_APP_PRIVATE_KEY,
  GITHUB_APP_ID,
  GITHUB_ORG,
} = Bun.env as unknown as Env;

/* support both named and default exports */

export default {
  SUPABASE_JWT_SECRET,
  SUPABASE_KEY,
  SUPABASE_URL,
  GITHUB_INSTALLATION_ID,
  GITHUB_APP_PRIVATE_KEY,
  GITHUB_APP_ID,
  GITHUB_ORG,
};

export {
  SUPABASE_JWT_SECRET,
  SUPABASE_KEY,
  SUPABASE_URL,
  GITHUB_INSTALLATION_ID,
  GITHUB_APP_PRIVATE_KEY,
  GITHUB_APP_ID,
  GITHUB_ORG,
};
