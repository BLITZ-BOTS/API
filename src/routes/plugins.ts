import { GITHUB_ORG } from "@/config";
import { zipToFolder } from "@/lib/fs-zip";
import { octokit } from "@/lib/octo";
import { Hono } from "hono";
import { RequestError } from "octokit";
import { z } from "zod";
import { readDirRecursive } from "@/lib/fs-zip";
import { readFile } from "fs/promises";
import { jsonResponse } from "@/lib/response";
import { logger } from "@/lib/logger";
import { pluginParamsSchema, pluginSchema } from "@/schema/plugin";
import {
  getPlugin,
  getPlugins,
  reformatPlugin,
  type BasicRepoInfo,
} from "@/registry-api";

export const pluginsRoute = new Hono();

pluginsRoute.post("/", async (c) => {
  /* console logs are chatgpted (needed heavy logging fast to know what was happening) */
  logger.info("📥 Starting plugin upload request");

  const reqParts = await c.req.parseBody();
  const data = pluginParamsSchema.parse(reqParts);
  const { name, description, version, author, tags, file: zipFile } = data;
  let wasRepoCreated = false;

  logger.info(`📦 Processing plugin upload: ${name} v${version} by ${author}`);

  try {
    logger.info(`🔍 Checking if plugin ${name} already exists...`);
    await octokit.rest.repos.get({ owner: GITHUB_ORG, repo: name });
    logger.info(`⚠️ Plugin ${name} already exists, returning conflict error`);
    return jsonResponse.error(c, "Conflict", "Plugin already exists", 409);
  } catch (e) {
    if (e instanceof RequestError && e.status !== 404) {
      logger.error(`❌ Unexpected error checking repo existence:`, e);
      throw e;
    }
    logger.info(`✅ Plugin name ${name} is available`);
  }

  try {
    logger.info(`📂 Extracting zip file to temporary directory...`);
    const tempDir = await zipToFolder(zipFile);
    logger.info(`📁 Temp directory created at: ${tempDir}`);

    const allFilePaths = await readDirRecursive(tempDir);
    logger.info(`📄 Found ${allFilePaths.length} total files`);

    const pluginFilePaths = allFilePaths.filter((path) => !path.endsWith(".zip"));
    logger.info(`📑 Processing ${pluginFilePaths.length} plugin files`);

    logger.info(`🏗️ Creating new GitHub repository: ${name}`);
    const [createdRepo] = await Promise.all([
      octokit.rest.repos.createInOrg({
        org: GITHUB_ORG,
        name,
        description,
        private: true,
        auto_init: true,
        default_branch: "main",
      }),
    ]);
    wasRepoCreated = true;
    logger.info(`✅ Repository created successfully: ${createdRepo.data.html_url}`);

    logger.info(`🔄 Creating blobs for ${pluginFilePaths.length} files...`);
    const treeItems = await Promise.all(
      allFilePaths.map(async (filePath) => {
        const relativePath = filePath.split(tempDir)[1].replace(/^[/\\]/, "");
        const content = await readFile(filePath, "utf-8"); /* read content w no blobs */

        return {
          path: relativePath,
          mode: "100644" as const,
          type: "blob" as const,
          content: content,
        };
      })
    );

    logger.info(`🔍 Getting main branch SHA...`);
    const mainBranch = await octokit.rest.repos.getBranch({
      owner: GITHUB_ORG,
      repo: name,
      branch: "main",
    });
    logger.info(`✅ Got main branch SHA: ${mainBranch.data.commit.sha}`);

    logger.info(`🌳 Creating Git tree...`);
    const tree = await octokit.rest.git.createTree({
      owner: GITHUB_ORG,
      repo: name,
      base_tree: mainBranch.data.commit.sha,
      tree: treeItems,
    });
    logger.info(`✅ Tree created with SHA: ${tree.data.sha}`);

    logger.info(`📝 Creating initial commit...`);
    const commit = await octokit.rest.git.createCommit({
      owner: GITHUB_ORG,
      repo: name,
      message: "Initial plugin files upload",
      tree: tree.data.sha,
      parents: [mainBranch.data.commit.sha],
    });
    logger.info(`✅ Commit created with SHA: ${commit.data.sha}`);

    logger.info(`🔄 Updating main branch and setting topics...`);
    await Promise.all([
      octokit.rest.git
        .updateRef({
          owner: GITHUB_ORG,
          repo: name,
          ref: "heads/main",
          sha: commit.data.sha,
        })
        .then(() => logger.info(`✅ Main branch updated successfully`)),
      octokit.rest.repos
        .replaceAllTopics({
          owner: GITHUB_ORG,
          repo: name,
          names: [...tags, `author-${c.user?.id ?? "dev"}`],
        })
        .then(() => logger.info(`✅ Topics updated successfully`)),
    ]);
    logger.info(`✅ Branch updated and topics set successfully`);

    logger.info(`🎉 Plugin upload completed successfully!`);
    return jsonResponse.success(c, { name, description, version, author, tags });
  } catch (e) {
    if (wasRepoCreated) {
      logger.info(`🔄 Deleting repository ${name}...`);
      await octokit.rest.repos.delete({
        owner: GITHUB_ORG,
        repo: name,
      });
      logger.info(`✅ Repository deleted successfully`);
    }
    logger.error(`❌ Error uploading plugin:`, e);
    throw e;
  }
});

pluginsRoute.delete("/:name", async (c) => {
  const name = c.req.param("name");
  const repo = await getPlugin(name);

  if (!repo) {
    return jsonResponse.error(c, "Plugin not found", "", 404);
  }

  if (repo.author !== c.user?.id) {
    return jsonResponse.error(c, "Unauthorized", "You can't delete this.", 401);
  }

  try {
    await octokit.rest.repos.delete({
      owner: GITHUB_ORG,
      repo: name,
    });
    return jsonResponse.success(c, null);
  } catch (e) {
    logger.error(`❌ Error deleting plugin:`, e);
    throw e;
  }
});

/* 
crdl -
create
read
delete
list
*/

const allParamsSchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  per_page: z.coerce.number().min(1).max(100).optional().default(25),
});

/* only for testing for now */
pluginsRoute.get("/all", async (c) => {
  const { page, per_page } = allParamsSchema.parse(c.req.query());

  const data = await getPlugins(page, per_page);

  return jsonResponse.success(c, data);
});
