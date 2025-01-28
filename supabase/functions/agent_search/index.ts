import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create service role client for admin operations
    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get user from auth token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: corsHeaders }
      )
    }

    const { data: { user }, error: userError } = await serviceRoleClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: corsHeaders }
      )
    }

    // Check if user is agent or admin
    const isAgentOrAdmin = user.user_metadata?.role === 'agent' || user.user_metadata?.role === 'admin'
    if (!isAgentOrAdmin) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized. Only agents and admins can search agents.' }),
        { status: 403, headers: corsHeaders }
      )
    }

    // Get and validate search query
    let query: string
    try {
      const body = await req.json()
      query = body.query?.trim()
      
      if (!query) {
        return new Response(
          JSON.stringify({ error: 'Search query is required' }),
          { status: 400, headers: corsHeaders }
        )
      }
    } catch (error) {
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        { status: 400, headers: corsHeaders }
      )
    }

    // Search for agents using parameterized query
    const { data: agents, error: searchError } = await serviceRoleClient
      .from('profiles')
      .select('id, email, full_name, role')
      .or(`email.ilike.%${query}%,full_name.ilike.%${query}%`)
      .in('role', ['agent', 'admin'])
      .order('full_name')
      .limit(10)

    if (searchError) {
      console.error('Search error:', searchError)
      return new Response(
        JSON.stringify({ error: 'Failed to search agents' }),
        { status: 500, headers: corsHeaders }
      )
    }

    if (!agents) {
      return new Response(
        JSON.stringify({ agents: [] }),
        { headers: corsHeaders }
      )
    }

    // Format response
    const formattedAgents = agents.map(agent => ({
      id: agent.id,
      email: agent.email,
      name: agent.full_name || agent.email.split('@')[0],
      role: agent.role,
      display: agent.full_name ? `${agent.full_name} (${agent.email})` : agent.email
    }))

    return new Response(
      JSON.stringify({ agents: formattedAgents }),
      { headers: corsHeaders }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      { status: 500, headers: corsHeaders }
    )
  }
}) 