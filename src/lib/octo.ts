import { GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_INSTALLATION_ID } from "@/config";
import { App } from "octokit";

// Initialize GitHub App
const octoapp = new App({
  appId: GITHUB_APP_ID,
  privateKey: GITHUB_APP_PRIVATE_KEY,
});

// Get an installation access token
export const octokit = await octoapp.getInstallationOctokit(
  parseInt(GITHUB_INSTALLATION_ID)
);
