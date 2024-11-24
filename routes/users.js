import { authenticateUser } from '../middlewear/auth.js';
import { createClient } from '@supabase/supabase-js';

import * as config from '../config.js';

const supabase = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_KEY
);

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
        const userId = request.user.id;

        const { error } = await supabase
          .from('profile')
          .upsert({ 
            id: userId,
            pella_api_key: pella_api_key,
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
}