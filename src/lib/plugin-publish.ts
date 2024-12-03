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

  try {
    // Step 1: Extract zip contents to temporary directory
    const tempDir = await zipToFolder(zipFile);
    const allFilePaths = await readDirRecursive(tempDir);

    // Step 2: Create a new GitHub repository
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

    // Step 3: Branch Management
    // Get the default branch reference
    const mainRef = await octokit.rest.git.getRef({
      owner: GITHUB_ORG,
      repo: name,
      ref: "heads/main",
    });

    // Create version-specific branch from main
    await octokit.rest.git.createRef({
      owner: GITHUB_ORG,
      repo: name,
      ref: `refs/heads/${branchName}`,
      sha: mainRef.data.object.sha,
    });

    // Remove the default main branch
    await octokit.rest.git.deleteRef({
      owner: GITHUB_ORG,
      repo: name,
      ref: "heads/main",
    });

    // Step 4: Prepare and upload plugin files
    // Convert local files to GitHub tree items
    const treeItems = await allFilePathsToTreeItems(allFilePaths, tempDir, name);
    logger.debug("File tree prepared", { name });

    // Get the target branch for committing files
    const targetBranch = await octokit.rest.repos.getBranch({
      owner: GITHUB_ORG,
      repo: name,
      branch: branchName,
    });

    // Create a new Git tree with all plugin files
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

    // Step 5: Create commit with plugin files
    const commit = await octokit.rest.git.createCommit({
      owner: GITHUB_ORG,
      repo: name,
      message: "Initial plugin files upload",
      tree: tree.data.sha,
      parents: [targetBranch.data.commit.sha],
    });

    // Step 6: Finalize repository setup
    await Promise.all([
      // Update branch to point to new commit
      octokit.rest.git.updateRef({
        owner: GITHUB_ORG,
        repo: name,
        ref: "heads/" + branchName,
        sha: commit.data.sha,
      }),
      // Set repository topics including author tag
      octokit.rest.repos.replaceAllTopics({
        owner: GITHUB_ORG,
        repo: name,
        names: [...tags, `author-${userId}`],
      }),
    ]);

    // Step 7: Return formatted plugin data
    return pluginSchema.parse({
      name,
      description,
      versions: sortVersions(version),
      author: userId,
      tags,
      repoUrl: `https://github.com/${GITHUB_ORG}/${name}/tree/${branchName}`,
    });
  } catch (e) {
    // Cleanup: Delete repository if creation failed
    if (wasRepoCreated) {
      octokit.rest.repos.delete({
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

  try {
    // Step 1: Verify new version doesn't exist
    try {
      await octokit.rest.repos.getBranch({
        owner: GITHUB_ORG,
        repo: name,
        branch: branchName,
      });
      throw new Error(`Version ${version} already exists`);
    } catch (e: any) {
      if (e.status !== 404) throw e;
    }

    // Step 2: Extract zip contents to temporary directory
    const tempDir = await zipToFolder(zipFile);
    const allFilePaths = await readDirRecursive(tempDir);

    // Step 3: Get the default branch reference
    const defaultBranch = await octokit.rest.repos.getBranch({
      owner: GITHUB_ORG,
      repo: name,
      branch: currentPlugin.versions[0],
    });

    // Step 4: Create new version branch
    await octokit.rest.git.createRef({
      owner: GITHUB_ORG,
      repo: name,
      ref: `refs/heads/${branchName}`,
      sha: defaultBranch.data.commit.sha,
    });

    // Step 5: Prepare and upload plugin files
    const treeItems = await allFilePathsToTreeItems(allFilePaths, tempDir, name);
    logger.debug("File tree prepared", { name });

    // Create a new Git tree with updated files
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

    // Step 6: Create commit with updated files
    const commit = await octokit.rest.git.createCommit({
      owner: GITHUB_ORG,
      repo: name,
      message: `Update plugin to version ${version}`,
      tree: tree.data.sha,
      parents: [defaultBranch.data.commit.sha],
    });

    // Step 7: Finalize repository updates
    await Promise.all([
      // Update branch to point to new commit
      octokit.rest.git.updateRef({
        owner: GITHUB_ORG,
        repo: name,
        ref: `heads/${branchName}`,
        sha: commit.data.sha,
      }),
      // Update repository metadata
      octokit.rest.repos.update({
        owner: GITHUB_ORG,
        repo: name,
        name,
        description: description ?? undefined,
        homepage: url ?? undefined,
        default_branch: branchName,
      }),
      // Update repository topics
      octokit.rest.repos.replaceAllTopics({
        owner: GITHUB_ORG,
        repo: name,
        names: [...tags, `author-${userId}`],
      }),
    ]);

    // Step 8: Return updated plugin data
    return pluginSchema.parse({
      name,
      description,
      versions: sortVersions(version, currentPlugin.versions),
      author: userId,
      tags,
      repoUrl: `https://github.com/${GITHUB_ORG}/${name}/tree/${branchName}`,
    });
  } catch (e) {
    // Clean up new branch if creation failed
    try {
      await octokit.rest.git.deleteRef({
        owner: GITHUB_ORG,
        repo: name,
        ref: `heads/${branchName}`,
      });
    } catch {}
    throw e;
  }
}
