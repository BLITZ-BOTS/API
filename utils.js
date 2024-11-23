import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import * as config from './config'

export async function readDirRecursive(dir) {
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      files.push(...await readDirRecursive(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

export async function getRepoDetails(octokit, name) {
  const repoResponse = await octokit.rest.repos.get({
    owner: config.GITHUB_ORG,
    repo: name
  });

  const topicsResponse = await octokit.rest.repos.getAllTopics({
    owner: config.GITHUB_ORG,
    repo: name
  });

  let version = 'unknown';
  try {
    const packageJson = await octokit.rest.repos.getContent({
      owner: config.GITHUB_ORG,
      repo: name,
      path: 'package.json'
    });

    if (packageJson.data.type === 'file') {
      const content = Buffer.from(packageJson.data.content, 'base64').toString();
      const pkg = JSON.parse(content);
      version = pkg.version || 'unknown';
    }
  } catch (error) {
    // package.json might not exist, keep version as unknown
  }

  // Extract author ID from tags and filter it out from the tags array
  const tags = topicsResponse.data.names;
  const authorTag = tags.find(tag => tag.startsWith('author-'));
  const authorId = authorTag ? authorTag.replace('author-', '') : null;
  const filteredTags = tags.filter(tag => !tag.startsWith('author-'));

  return {
    name: repoResponse.data.name,
    description: repoResponse.data.description || '',
    version,
    authorId,
    tags: filteredTags,
    url: repoResponse.data.html_url
  };
}