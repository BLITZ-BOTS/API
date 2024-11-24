import { authenticateUser } from '../middlewear/auth.js';
import { createClient } from '@supabase/supabase-js';
import * as config from '../config.js';

export async function registerUserRoutes(fastify) {
  fastify.post('/user/set/pella_key', {
    preHandler: authenticateUser,
    schema: {
      body: {
        type: 'object',
        required: ['pella_api_key'],
        properties: {
          pella_api_key: { type: 'string' }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { pella_api_key } = request.body;
        const token = request.headers.authorization.split(' ')[1];

        // Create a new Supabase client with the user's JWT
        const supabase = createClient(
          config.SUPABASE_URL,
          config.SUPABASE_KEY,
          {
            global: {
              headers: {
                Authorization: `Bearer ${token}`
              }
            }
          }
        );

        const { error } = await supabase
          .from('profile')
          .upsert({ 
            id: request.user.id,
            pella_api_key: pella_api_key
          });

        if (error) {
          request.log.error(error);
          return reply.code(500).send({
            statusCode: 500,
            error: 'Internal Server Error',
            message: 'Failed to update Pella API key'
          });
        }

        return {
          success: true,
          message: 'Pella API key updated successfully'
        };
      } catch (error) {
        request.log.error(error);
        throw error;
      }
    }
  });

  fastify.post('/user/create/project', {
    preHandler: authenticateUser,
    schema: {
      body: {
        type: 'object',
        required: ['name', 'host', 'server_id'],
        properties: {
          name: { type: 'string' },
          host: { type: 'string' },
          server_id: { type: 'string' }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { name, host, server_id } = request.body;
        const token = request.headers.authorization.split(' ')[1];

        const supabase = createClient(
          config.SUPABASE_URL,
          config.SUPABASE_KEY,
          {
            global: {
              headers: {
                Authorization: `Bearer ${token}`
              }
            }
          }
        );

        // First, get the current projects array
        const { data: profile, error: fetchError } = await supabase
          .from('profile')
          .select('projects')
          .eq('id', request.user.id)
          .single();

        if (fetchError) {
          request.log.error(fetchError);
          return reply.code(500).send({
            statusCode: 500,
            error: 'Internal Server Error',
            message: 'Failed to fetch user profile'
          });
        }

        // Initialize projects array if it doesn't exist
        const currentProjects = profile?.projects || [];

        // Create new project object
        const newProject = {
          [name]: {
            host,
            server_id
          }
        };

        // Add new project to array
        const updatedProjects = [...currentProjects, newProject];

        // Update the profile with new projects array
        const { error: updateError } = await supabase
          .from('profile')
          .update({ 
            projects: updatedProjects
          })
          .eq('id', request.user.id);

        if (updateError) {
          request.log.error(updateError);
          return reply.code(500).send({
            statusCode: 500,
            error: 'Internal Server Error',
            message: 'Failed to update projects'
          });
        }

        return {
          success: true,
          message: 'Project added successfully',
          project: newProject
        };
      } catch (error) {
        request.log.error(error);
        throw error;
      }
    }
  });
}