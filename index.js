import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import formbody from '@fastify/formbody';
import { App } from 'octokit';
import { registerPluginRoutes } from './routes/plugins.js';

import * as config from './config.js'

const fastify = Fastify({
  logger: true,
});

// Register plugins
await fastify.register(formbody);
await fastify.register(multipart);

// Initialize GitHub App
const app = new App({
  appId: config.GITHUB_APP_ID,
  privateKey: config.GITHUB_APP_PRIVATE_KEY,
});

// Get an installation access token
const octokit = await app.getInstallationOctokit(config.GITHUB_INSTALLATION_ID);

// Register routes
await registerPluginRoutes(fastify, octokit);

// Start server
try {
  await fastify.listen({ port: 3000, host: '0.0.0.0' });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}