import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import * as config from   '../config'
const supabase = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_KEY
);

export async function authenticateUser(request, reply) {
  const authHeader = request.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing or invalid authorization header'
    });
  }

  const token = authHeader.split(' ')[1];


  try {
    // Verify the JWT using Supabase JWT secret
    const decoded = jwt.verify(token, config.SUPABASE_JWT_SECRET);
    
    // Get user data from Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid token or user not found'
      });
    }

    // Attach user to request for use in routes
    request.user = user;
  } catch (error) {
    return reply.code(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid token'
    });
  }
}