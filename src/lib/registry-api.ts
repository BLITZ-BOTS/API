import type { z } from "zod";
import { GITHUB_ORG } from "@/config";
import { octokit } from "@/lib/octo";
import { pluginSchema } from "@/schema/plugin";
import { RequestError } from "octokit";

export interface BasicRepoInfo {
  name: string;
  description: string;
  topics?: string[];
}

function topicsToAuthor(topics: string[]) {
  const authorTopic = topics.find((topic) => topic.startsWith("author-"));
  return authorTopic ? authorTopic.replace("author-", "") : null;
}

export function reformatPlugin(repo: BasicRepoInfo): z.infer<typeof pluginSchema> {
  const topics = repo.topics ?? [];
  const author = topicsToAuthor(topics) ?? "unknown";
  const tags = topics.filter((t) => !t.startsWith("author-")).join(",");

  return pluginSchema.parse({
    name: repo.name,
    description: repo.description,
    version: "unknown",
    author,
    tags,
  });
}

export async function getPlugins(
  page: number,
  per_page: number
): Promise<z.infer<typeof pluginSchema>[]> {
  const { data } = await octokit.rest.repos.listForOrg({
    org: GITHUB_ORG,
    per_page,
    page,
  });

  const refinedData = data.map((e) => reformatPlugin(e as BasicRepoInfo));

  return refinedData;
}

export async function getPlugin(
  name: string
): Promise<z.infer<typeof pluginSchema> | null> {
  try {
    const { data } = await octokit.rest.repos.get({
      owner: GITHUB_ORG,
      repo: name,
    });

    return reformatPlugin(data as BasicRepoInfo);
  } catch (e) {
    if (e instanceof RequestError && e.status === 404) {
      return null;
    }
    throw e;
  }
}

export async function deletePlugin(name: string) {
  await octokit.rest.repos.delete({
    owner: GITHUB_ORG,
    repo: name,
  });
}
