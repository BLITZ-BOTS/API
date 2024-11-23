import { getRepoDetails, readDirRecursive } from '../utils.js';
import { authenticateUser } from '../middlewear/auth.js';
import { pipeline } from 'node:stream/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import unzipper from 'unzipper';

import * as config from '../config.js'

export async function registerPluginRoutes(fastify, octokit) {
  // Create plugin route with authentication
  fastify.post('/plugins/create', {
    preHandler: authenticateUser,
    handler: async (request, reply) => {
      try {
        const parts = request.parts();
        
        const fields = {};
        let zipFile = null;

        for await (const part of parts) {
          if (part.type === 'file') {
            zipFile = part;
          } else {
            fields[part.fieldname] = part.value;
          }
        }

        if (!zipFile) {
          throw new Error('No file uploaded');
        }

        const { name, description, version, author } = fields;
        const tags = fields.tags ? JSON.parse(fields.tags) : [];
        
        if (!name || !description || !version || !author) {
          throw new Error('Missing required fields');
        }

        try {
          await octokit.rest.repos.get({
            owner: config.GITHUB_ORG,
            repo: name
          });
          
          return reply
            .code(409)
            .send({
              statusCode: 409,
              error: 'Conflict',
              message: `A repository with the name "${name}" already exists in the organization`
            });
        } catch (error) {
          if (error.status !== 404) {
            throw error;
          }
        }

        const tempDir = join(tmpdir(), `plugin-${Date.now()}`);
        await mkdir(tempDir, { recursive: true });

        const zipPath = join(tempDir, 'plugin.zip');
        await pipeline(zipFile.file, createWriteStream(zipPath));
        
        await createReadStream(zipPath)
          .pipe(unzipper.Extract({ path: tempDir }))
          .promise();

        const repo = await octokit.rest.repos.createInOrg({
          org: config.GITHUB_ORG,
          name,
          description,
          private: false,
          auto_init: false
        });

        const files = await readDirRecursive(tempDir);
        for (const file of files) {
          if (file === zipPath) continue;
          
          const content = await readFile(file, 'base64');
          const relativePath = file.replace(tempDir + '/', '');
          
          await octokit.rest.repos.createOrUpdateFileContents({
            owner: config.GITHUB_ORG,
            repo: name,
            path: relativePath,
            message: `Add ${relativePath}`,
            content,
          });
        }

        // Add author tag along with other tags
        const allTags = [...tags, `author-${request.user.id}`];
        await octokit.rest.repos.replaceAllTopics({
          owner: config.GITHUB_ORG,
          repo: name,
          names: allTags
        });

        return {
          success: true,
          repository: repo.data.html_url
        };
      } catch (error) {
        request.log.error(error);
        throw error;
      }
    }
  });

  // Delete plugin route with authentication
  fastify.delete('/plugins/delete/:name', {
    preHandler: authenticateUser,
    handler: async (request, reply) => {
      try {
        const { name } = request.params;

        // Get repo details to check ownership
        const repo = await octokit.rest.repos.get({
          owner: config.GITHUB_ORG,
          repo: name
        });

        // Get topics to check author tag
        const topics = await octokit.rest.repos.getAllTopics({
          owner: config.GITHUB_ORG,
          repo: name
        });

        const authorTag = `author-${request.user.id}`;
        if (!topics.data.names.includes(authorTag)) {
          return reply.code(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'You do not have permission to delete this plugin'
          });
        }

        // Delete the repository
        await octokit.rest.repos.delete({
          owner: config.GITHUB_ORG,
          repo: name
        });

        return {
          success: true,
          message: `Plugin "${name}" has been deleted`
        };
      } catch (error) {
        if (error.status === 404) {
          return reply.code(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: `Plugin "${request.params.name}" not found`
          });
        }
        request.log.error(error);
        throw error;
      }
    }
  });

  fastify.get('/plugins/:name', async (request, reply) => {
    try {
      const { name } = request.params;
      return await getRepoDetails(octokit, name);
    } catch (error) {
      if (error.status === 404) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Plugin "${request.params.name}" not found`
        });
      }
      throw error;
    }
  });

  fastify.get('/plugins/search/:query', async (request, reply) => {
    try {
      const { query } = request.params;
      
      const searchResults = await octokit.rest.search.repos({
        q: `org:${config.GITHUB_ORG} ${query} in:name`,
        per_page: 100
      });

      const plugins = await Promise.all(
        searchResults.data.items.map(repo => getRepoDetails(octokit, repo.name))
      );

      return {
        total_count: searchResults.data.total_count,
        plugins
      };
    } catch (error) {
      request.log.error(error);
      throw error;
    }
  });

  fastify.get('/plugins/random', async (request, reply) => {
    try {
      const { count = 1 } = request.query;
      const limit = Math.min(Math.max(1, parseInt(count)), 100); // Limit between 1 and 100

      // Get all repositories in the organization
      const repos = await octokit.paginate(octokit.rest.repos.listForOrg, {
        org: config.GITHUB_ORG,
        per_page: 100
      });

      // Shuffle array and take requested number of items
      const shuffled = repos
        .sort(() => 0.5 - Math.random())
        .slice(0, limit);

      const plugins = await Promise.all(
        shuffled.map(repo => getRepoDetails(octokit, repo.name))
      );

      return {
        count: plugins.length,
        plugins
      };
    } catch (error) {
      request.log.error(error);
      throw error;
    }
  });
}