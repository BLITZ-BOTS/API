import { GITHUB_ORG } from "@/config";
import { zipToFolder } from "@/lib/fs-zip";
import { octokit } from "@/lib/octo";
import { Hono } from "hono";
import { RequestError } from "octokit";
import { z } from "zod";
import { readDirRecursive } from "@/lib/fs-zip";
import { readFile } from "fs/promises";

const paramsSchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string(),
  author: z.string(),
  tags: z
    .string()
    .optional()
    .describe("comma-separated list of tags")
    .transform((tags) => tags?.split(",") ?? []),
  file: z
    .instanceof(File)
    .describe("zip file")
    .refine(
      (file) =>
        ["application/zip", "application/x-zip-compressed"].includes(file.type) &&
        file.name.toLowerCase().endsWith(".zip") &&
        file.size < 5 * 1024 * 1024 /* 5mb */
    ),
});

export const pluginsRoute = new Hono();

pluginsRoute.post("/", async (c) => {
  /* console logs are chatgpted (needed heavy logging fast to know what was happening) */
  console.log("📥 Starting plugin upload request");

  const reqParts = await c.req.parseBody();
  const data = paramsSchema.parse(reqParts);
  const { name, description, version, author, tags, file: zipFile } = data;
  let wasRepoCrated = false;

  console.log(`📦 Processing plugin upload: ${name} v${version} by ${author}`);

  try {
    console.log(`🔍 Checking if plugin ${name} already exists...`);
    await octokit.rest.repos.get({ owner: GITHUB_ORG, repo: name });
    console.log(`⚠️ Plugin ${name} already exists, returning conflict error`);
    return c.json({ error: "Conflict", message: "Plugin already exists" }, 409);
  } catch (e) {
    if (e instanceof RequestError && e.status !== 404) {
      console.error(`❌ Unexpected error checking repo existence:`, e);
      throw e;
    }
    console.log(`✅ Plugin name ${name} is available`);
  }

  try {
    console.log(`📂 Extracting zip file to temporary directory...`);
    const tempDir = await zipToFolder(zipFile);
    console.log(`📁 Temp directory created at: ${tempDir}`);

    const allFilePaths = await readDirRecursive(tempDir);
    console.log(`📄 Found ${allFilePaths.length} total files`);

    const pluginFilePaths = allFilePaths.filter((path) => !path.endsWith(".zip"));
    console.log(`📑 Processing ${pluginFilePaths.length} plugin files`);

    console.log(`🏗️ Creating new GitHub repository: ${name}`);
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
    wasRepoCrated = true;
    console.log(`✅ Repository created successfully: ${createdRepo.data.html_url}`);

    console.log(`🔄 Creating blobs for ${pluginFilePaths.length} files...`);
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

    console.log(`🔍 Getting main branch SHA...`);
    const mainBranch = await octokit.rest.repos.getBranch({
      owner: GITHUB_ORG,
      repo: name,
      branch: "main",
    });
    console.log(`✅ Got main branch SHA: ${mainBranch.data.commit.sha}`);

    console.log(`🌳 Creating Git tree...`);
    const tree = await octokit.rest.git.createTree({
      owner: GITHUB_ORG,
      repo: name,
      base_tree: mainBranch.data.commit.sha,
      tree: treeItems,
    });
    console.log(`✅ Tree created with SHA: ${tree.data.sha}`);

    console.log(`📝 Creating initial commit...`);
    const commit = await octokit.rest.git.createCommit({
      owner: GITHUB_ORG,
      repo: name,
      message: "Initial plugin files upload",
      tree: tree.data.sha,
      parents: [mainBranch.data.commit.sha],
    });
    console.log(`✅ Commit created with SHA: ${commit.data.sha}`);

    console.log(`🔄 Updating main branch and setting topics...`);
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
        names: [...tags, `author-${c.user?.id ?? "dev"}`],
      }),
    ]);
    console.log(`✅ Branch updated and topics set successfully`);

    console.log(`🎉 Plugin upload completed successfully!`);
    return c.json({ name, description, version, author, tags });
  } catch (e) {
    if (wasRepoCrated) {
      console.log(`🔄 Deleting repository ${name}...`);
      await octokit.rest.repos.delete({
        owner: GITHUB_ORG,
        repo: name,
      });
      console.log(`✅ Repository deleted successfully`);
    }
    console.error(`❌ Error uploading plugin:`, e);
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

/* only for testing for now */
pluginsRoute.get("/all", async (c) => {
  const { data } = await octokit.rest.repos.listForOrg({
    org: GITHUB_ORG,
    per_page: 100,
  });
  return c.json(data);
});
