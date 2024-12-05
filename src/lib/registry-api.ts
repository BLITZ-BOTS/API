import type { z } from "zod";
import { GITHUB_ORG } from "@/config";
import { octokit } from "@/lib/octo";
import { pluginSchema } from "@/schema/plugin";
import { RequestError } from "octokit";
import { logger } from "./logger";
import type { authorSchema } from "@/schema/author";
import { getUserById } from "./supabase";

export interface BasicRepoInfo {
  name: string;
  description: string;
  html_url: string;
  default_branch: string;
  topics?: string[];
}

function topicsToAuthor(topics: string[]) {
  const authorTopic = topics.find((topic) => topic.startsWith("author-"));
  return authorTopic ? authorTopic.replace("author-", "") : null;
}

export function sortVersions(defaultv: string, versions?: string[]) {
  return versions ? [defaultv, ...versions.filter((v) => v !== defaultv)] : [defaultv];
}

export function reformatPlugin(
  repo: BasicRepoInfo,
  {
    versions,
    currentVersion,
    author,
  }: {
    versions?: string[];
    currentVersion?: string;
    author?: z.infer<typeof authorSchema>;
  } = {}
): z.infer<typeof pluginSchema> {
  const topics = repo.topics ?? [];
  const authorId = topicsToAuthor(topics);
  const tags = topics.filter((t) => !t.startsWith("author-"));

  // Sort versions to put default branch first
  const sortedVersions = sortVersions(repo.default_branch, versions);

  return pluginSchema.parse({
    name: repo.name,
    description: repo.description,
    versions: sortedVersions,
    author_id: authorId,
    author: author ?? null,
    tags,
    repoUrl: `https://github.com/${GITHUB_ORG}/${repo.name}/tree/${
      currentVersion || repo.default_branch
    }`,
  });
}

export async function getPlugins(
  page: number,
  per_page: number,
  authorId?: string
): Promise<z.infer<typeof pluginSchema>[]> {
  if (authorId) {
    const { data } = await octokit.rest.search.repos({
      q: `org:${GITHUB_ORG} topic:author-${authorId}`,
      per_page,
      page,
    });
    return data.items.map((e) => reformatPlugin(e as BasicRepoInfo));
  }

  const { data } = await octokit.rest.repos.listForOrg({
    org: GITHUB_ORG,
    per_page,
    page,
  });

  return data.map((e) => reformatPlugin(e as BasicRepoInfo));
}

export async function searchPlugins(
  query: string,
  page: number,
  per_page: number
): Promise<z.infer<typeof pluginSchema>[]> {
  const { data } = await octokit.rest.search.repos({
    q: `org:${GITHUB_ORG} ${query} in:name`,
    per_page,
    page,
  });

  const refinedData = data.items.map((e) => reformatPlugin(e as BasicRepoInfo));

  return refinedData;
}

export async function getPlugin(
  name: string,
  {
    version,
    showAllVersions,
    provideFullAuthor,
  }: {
    version?: string;
    showAllVersions?: boolean;
    provideFullAuthor?: boolean;
  } = {}
): Promise<z.infer<typeof pluginSchema> | null> {
  try {
    // Parallel fetches for repo and branch data
    const repoDataPromise = octokit.rest.repos.get({
      owner: GITHUB_ORG,
      repo: name,
    });

    const allVersionNamesPromise = showAllVersions
      ? octokit.rest.repos
          .listBranches({ owner: GITHUB_ORG, repo: name })
          .then(({ data }) => data.map((e) => e.name))
      : Promise.resolve(undefined);

    const versionBranchCheckPromise = version
      ? octokit.rest.repos
          .getBranch({ owner: GITHUB_ORG, repo: name, branch: version })
          .then(() => version)
          .catch((e) => {
            if (e instanceof RequestError && e.status === 404) {
              return null;
            }
            throw e;
          })
      : Promise.resolve(undefined);

    const [repoData, allVersionNames, currentVersion] = await Promise.all([
      repoDataPromise,
      allVersionNamesPromise,
      versionBranchCheckPromise,
    ]);

    if (currentVersion === null) {
      return null;
    }

    const extraParams: Parameters<typeof reformatPlugin>["1"] = {
      versions: allVersionNames,
      currentVersion,
    };

    const author_id = topicsToAuthor(repoData.data.topics ?? []);
    if (!author_id) {
      return null;
    }

    const fullAuthorPromise = provideFullAuthor
      ? getUserById(author_id).catch((e) => {
          if (e instanceof RequestError && e.status === 404) {
            return null;
          }
          throw e;
        })
      : Promise.resolve(undefined);

    const fullAuthor = await fullAuthorPromise;
    if (provideFullAuthor && !fullAuthor) {
      return null;
    }

    if (fullAuthor) {
      extraParams["author"] = fullAuthor;
    }

    return reformatPlugin(repoData.data as BasicRepoInfo, extraParams);
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
