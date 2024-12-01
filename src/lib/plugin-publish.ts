import { GITHUB_ORG } from "@/config";
import { zipToFolder, readDirRecursive } from "@/lib/fs-zip";
import { octokit } from "@/lib/octo";
import { readFile } from "fs/promises";
import { getPlugin } from "@/lib/registry-api";
import type { z } from "zod";
import { pluginParamsSchema } from "@/schema/plugin";

type PublishPluginParams = z.infer<typeof pluginParamsSchema>;

export async function publishPlugin(params: PublishPluginParams, userId: string) {
  const { name, description, version, tags, file: zipFile, url } = params;
  let wasRepoCreated = false;

  if ((await getPlugin(name)) !== null) {
    return {
      success: false,
      error: "Conflict",
      message: "Plugin already exists",
      status: 409,
    };
  }

  try {
    const tempDir = await zipToFolder(zipFile);
    const allFilePaths = await readDirRecursive(tempDir);

    await octokit.rest.repos.createInOrg({
      org: GITHUB_ORG,
      name,
      description,
      homepage: url,
      private: false,
      auto_init: true,
      default_branch: "main",
    });
    wasRepoCreated = true;

    const treeItems = await Promise.all(
      allFilePaths.map(async (filePath) => {
        const relativePath = filePath.split(tempDir)[1].replace(/^[/\\]/, "");
        const content = await readFile(filePath, "utf-8");
        return {
          path: relativePath,
          mode: "100644" as const,
          type: "blob" as const,
          content: content,
        };
      })
    );

    const mainBranch = await octokit.rest.repos.getBranch({
      owner: GITHUB_ORG,
      repo: name,
      branch: "main",
    });

    const tree = await octokit.rest.git.createTree({
      owner: GITHUB_ORG,
      repo: name,
      base_tree: mainBranch.data.commit.sha,
      tree: treeItems,
    });

    const commit = await octokit.rest.git.createCommit({
      owner: GITHUB_ORG,
      repo: name,
      message: "Initial plugin files upload",
      tree: tree.data.sha,
      parents: [mainBranch.data.commit.sha],
    });

    await Promise.all([
      octokit.rest.git.updateRef({
        owner: GITHUB_ORG,
        repo: name,
        ref: "heads/main",
        sha: commit.data.sha,
      }),
      octokit.rest.repos.replaceAllTopics({
        owner: GITHUB_ORG,
        repo: name,
        names: [...tags, `author-${userId}`],
      }),
    ]);

    return {
      success: true,
      data: { name, description, version, userId, tags },
    };
  } catch (e) {
    if (wasRepoCreated) {
      /* delete repo (don't await) */
      octokit.rest.repos.delete({
        owner: GITHUB_ORG,
        repo: name,
      });
    }
    throw e;
  }
}
