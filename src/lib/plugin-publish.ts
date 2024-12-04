import { GITHUB_ORG } from "@/config";
import { zipToFolder, readDirRecursive } from "@/lib/fs-zip";
import { octokit } from "@/lib/octo";
import { readFile } from "fs/promises";
import type { z } from "zod";
import {
  pluginCreateParamsSchema,
  pluginSchema,
  pluginUpdateParamsSchema,
} from "@/schema/plugin";
import { logger } from "./logger";
import { sortVersions } from "./registry-api";

type PublishPluginParams = z.infer<typeof pluginCreateParamsSchema>;
type UpdatePluginParams = z.infer<typeof pluginUpdateParamsSchema>;

async function allFilePathsToTreeItems(
  allFilePaths: string[],
  tempDir: string,
  repoName: string
) {
  // Process in chunks of 3 concurrent requests
  const chunkSize = 3;
  const treeItems = [];

  for (let i = 0; i < allFilePaths.length; i += chunkSize) {
    const chunk = allFilePaths.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(
      chunk
        .filter((e) => !e.endsWith("blitz-dev-plugin.zip"))
        .map(async (filePath) => {
          const relativePath = filePath
            .split(tempDir)[1]
            .replace(/^[/\\]/, "")
            .split(/[/\\]/)
            .join("/");

          const content = await readFile(filePath, "utf-8");
          const blob = await octokit.rest.git.createBlob({
            owner: GITHUB_ORG,
            repo: repoName,
            content: content,
            encoding: "utf-8",
          });

          return {
            path: relativePath,
            mode: "100644",
            type: "blob",
            sha: blob.data.sha,
          };
        })
    );

    treeItems.push(...chunkResults);
  }

  return treeItems;
}

export async function publishPlugin(
  params: PublishPluginParams,
  userId: string
): Promise<z.infer<typeof pluginSchema>> {
  const { name, description, version, tags, file: zipFile, homepage: url } = params;
  let wasRepoCreated = false;
  const branchName = version ?? "main";

  logger.info("Starting plugin publication process", { name, version, userId });

  try {
    logger.info("Extracting zip contents", { name });
    const tempDir = await zipToFolder(zipFile);
    const allFilePaths = await readDirRecursive(tempDir);
    logger.info("Zip extraction complete", { name, fileCount: allFilePaths.length });

    logger.info("Creating GitHub repository", { name, org: GITHUB_ORG });
    await octokit.rest.repos.createInOrg({
      org: GITHUB_ORG,
      name,
      description: description ?? undefined,
      homepage: url ?? undefined,
      private: false,
      auto_init: true,
      default_branch: branchName,
    });
    logger.info("Repository created successfully", { name });
    wasRepoCreated = true;

    logger.info("Starting branch management", { name, branch: branchName });
    const mainRef = await octokit.rest.git.getRef({
      owner: GITHUB_ORG,
      repo: name,
      ref: "heads/main",
    });
    logger.info("Main branch reference obtained", {
      name,
      sha: mainRef.data.object.sha,
    });

    logger.info("Creating version branch", { name, branch: branchName });
    await octokit.rest.git.createRef({
      owner: GITHUB_ORG,
      repo: name,
      ref: `refs/heads/${branchName}`,
      sha: mainRef.data.object.sha,
    });

    logger.info("Removing default main branch", { name });
    await octokit.rest.git.deleteRef({
      owner: GITHUB_ORG,
      repo: name,
      ref: "heads/main",
    });

    logger.info("Preparing file tree", { name });
    const treeItems = await allFilePathsToTreeItems(allFilePaths, tempDir, name);
    logger.info("File tree prepared", { name, itemCount: treeItems.length });

    const targetBranch = await octokit.rest.repos.getBranch({
      owner: GITHUB_ORG,
      repo: name,
      branch: branchName,
    });

    logger.info("Creating Git tree", { name });
    const tree = await octokit.rest.git.createTree({
      owner: GITHUB_ORG,
      repo: name,
      base_tree: targetBranch.data.commit.sha,
      tree: treeItems as Array<{
        path?: string;
        mode?: "040000" | "100644" | "100755" | "160000" | "120000";
        type?: "tree" | "blob" | "commit";
        sha?: string | null;
        content?: string;
      }>,
    });
    logger.info("File tree created in repository", { name });

    logger.info("Creating commit", { name });
    const commit = await octokit.rest.git.createCommit({
      owner: GITHUB_ORG,
      repo: name,
      message: "Initial plugin files upload",
      tree: tree.data.sha,
      parents: [targetBranch.data.commit.sha],
    });

    logger.info("Finalizing repository setup", { name });
    await Promise.all([
      octokit.rest.git.updateRef({
        owner: GITHUB_ORG,
        repo: name,
        ref: "heads/" + branchName,
        sha: commit.data.sha,
      }),
      octokit.rest.repos.replaceAllTopics({
        owner: GITHUB_ORG,
        repo: name,
        names: [...tags, `author-${userId}`],
      }),
    ]);

    logger.info("Plugin publication completed successfully", {
      name,
      version: branchName,
      userId,
    });

    return pluginSchema.parse({
      name,
      description,
      versions: sortVersions(version),
      author: userId,
      tags,
      repoUrl: `https://github.com/${GITHUB_ORG}/${name}/tree/${branchName}`,
    });
  } catch (e) {
    logger.error("Plugin publication failed", {
      name,
      error: e instanceof Error ? e.message : String(e),
      userId,
    });

    if (wasRepoCreated) {
      logger.warn("Cleaning up failed repository", { name });
      await octokit.rest.repos.delete({
        owner: GITHUB_ORG,
        repo: name,
      });
    }
    throw e;
  }
}

export async function updatePlugin(
  params: UpdatePluginParams,
  userId: string,
  currentPlugin: z.infer<typeof pluginSchema>
): Promise<z.infer<typeof pluginSchema>> {
  const { name, description, version, tags, file: zipFile, homepage: url } = params;
  const branchName = version;
  let newBranchCreated = false;

  logger.info("Starting plugin update process", {
    name,
    currentVersion: currentPlugin.versions[0],
    newVersion: version,
    userId,
  });

  try {
    logger.info("Checking version existence", { name, version });
    try {
      await octokit.rest.repos.getBranch({
        owner: GITHUB_ORG,
        repo: name,
        branch: branchName,
      });
      logger.warn("Version already exists", { name, version });
      throw new Error(`Version ${version} already exists`);
    } catch (e: any) {
      if (e.status !== 404) throw e;
    }

    logger.info("Extracting updated plugin contents", { name });
    const tempDir = await zipToFolder(zipFile);
    const allFilePaths = await readDirRecursive(tempDir);
    logger.info("Files extracted", { name, fileCount: allFilePaths.length });

    logger.info("Getting default branch reference", { name });
    const defaultBranch = await octokit.rest.repos.getBranch({
      owner: GITHUB_ORG,
      repo: name,
      branch: currentPlugin.versions[0],
    });

    logger.info("Creating new version branch", { name, branch: branchName });
    await octokit.rest.git.createRef({
      owner: GITHUB_ORG,
      repo: name,
      ref: `refs/heads/${branchName}`,
      sha: defaultBranch.data.commit.sha,
    });
    newBranchCreated = true;

    logger.info("Preparing updated file tree", { name });
    const treeItems = await allFilePathsToTreeItems(allFilePaths, tempDir, name);
    logger.info("File tree prepared", { name, itemCount: treeItems.length });

    logger.info("Creating new Git tree", { name });
    const tree = await octokit.rest.git.createTree({
      owner: GITHUB_ORG,
      repo: name,
      base_tree: defaultBranch.data.commit.sha,
      tree: treeItems as Array<{
        path?: string;
        mode?: "040000" | "100644" | "100755" | "160000" | "120000";
        type?: "tree" | "blob" | "commit";
        sha?: string | null;
        content?: string;
      }>,
    });
    logger.info("File tree created in repository", { name });

    logger.info("Creating commit with updated files", { name });
    const commit = await octokit.rest.git.createCommit({
      owner: GITHUB_ORG,
      repo: name,
      message: `Update plugin to version ${version}`,
      tree: tree.data.sha,
      parents: [defaultBranch.data.commit.sha],
    });

    logger.info("Finalizing repository updates", { name });
    await Promise.all([
      octokit.rest.git.updateRef({
        owner: GITHUB_ORG,
        repo: name,
        ref: `heads/${branchName}`,
        sha: commit.data.sha,
      }),
      octokit.rest.repos.update({
        owner: GITHUB_ORG,
        repo: name,
        name,
        description: description ?? undefined,
        homepage: url ?? undefined,
        default_branch: branchName,
      }),
      octokit.rest.repos.replaceAllTopics({
        owner: GITHUB_ORG,
        repo: name,
        names: [...tags, `author-${userId}`],
      }),
    ]);

    logger.info("Plugin update completed successfully", {
      name,
      version,
      userId,
    });

    return pluginSchema.parse({
      name,
      description,
      versions: sortVersions(version, currentPlugin.versions),
      author: userId,
      tags,
      repoUrl: `https://github.com/${GITHUB_ORG}/${name}/tree/${branchName}`,
    });
  } catch (e) {
    logger.error("Plugin update failed", {
      name,
      version,
      error: e instanceof Error ? e.message : String(e),
      userId,
    });

    try {
      if (newBranchCreated) {
        logger.warn("Cleaning up failed branch", { name, branch: branchName });
        await octokit.rest.git.deleteRef({
          owner: GITHUB_ORG,
          repo: name,
          ref: `heads/${branchName}`,
        });
      }
    } catch (cleanupError) {
      logger.error("Branch cleanup failed", {
        name,
        branch: branchName,
        error:
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      });
    }
    throw e;
  }
}
