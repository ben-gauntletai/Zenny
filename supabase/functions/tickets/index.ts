import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { notifyTicketCreated, notifyTicketUpdated } from '../_shared/notifications.ts'

interface TicketCreationPayload {
  subject: string
  description: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  ticket_type: 'question' | 'incident' | 'problem' | 'task'
  topic: 'ISSUE' | 'INQUIRY' | 'OTHER' | 'PAYMENTS' | 'NONE'
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Get auth user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (userError || !user) {
      throw new Error('Invalid token')
    }

    // Handle different operations based on the request path and method
    const url = new URL(req.url)
    const path = url.pathname.split('/').pop()

    switch (req.method) {
      case 'POST':
        if (path === 'create') {
          return await handleTicketCreation(req, supabaseClient, user)
        }
        break
      
      case 'PUT':
        if (path === 'update') {
          return await handleTicketUpdate(req, supabaseClient, user)
        }
        break

      case 'GET':
        if (path === 'list') {
          return await handleTicketList(req, supabaseClient, user)
        }
        break
    }

    throw new Error(`Unsupported route: ${req.method} ${url.pathname}`)

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

async function handleTicketCreation(req: Request, supabaseClient: any, user: any) {
  const payload: TicketCreationPayload = await req.json()
  
  // Create the ticket
  const { data: ticket, error: ticketError } = await supabaseClient
    .from('tickets')
    .insert({
      ...payload,
      user_id: user.id,
      status: 'open'
    })
    .select()
    .single()

  if (ticketError) throw ticketError

  // Find available agent (simple round-robin for now)
  const { data: agents, error: agentError } = await supabaseClient
    .from('profiles')
    .select('id, email')
    .eq('role', 'agent')
    .order('last_assigned_at', { ascending: true })
    .limit(1)

  if (agentError) throw agentError

  // Assign ticket if agent available
  if (agents && agents.length > 0) {
    const { error: updateError } = await supabaseClient
      .from('tickets')
      .update({ 
        assigned_to: agents[0].id,
        last_agent_update: new Date().toISOString()
      })
      .eq('id', ticket.id)

    if (updateError) throw updateError

    // Update agent's last assigned timestamp
    await supabaseClient
      .from('profiles')
      .update({ last_assigned_at: new Date().toISOString() })
      .eq('id', agents[0].id)

    // Send notification
    await notifyTicketCreated(supabaseClient, { ...ticket, assigned_to: agents[0].id }, user)
  } else {
    // Notify all agents about unassigned ticket
    await notifyTicketCreated(supabaseClient, ticket, user)
  }

  return new Response(
    JSON.stringify({ ticket }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 
    }
  )
}

async function handleTicketUpdate(req: Request, supabaseClient: any, user: any) {
  const { id, ...updates } = await req.json()

  // Get current ticket state
  const { data: currentTicket, error: ticketError } = await supabaseClient
    .from('tickets')
    .select('*')
    .eq('id', id)
    .single()

  if (ticketError) throw ticketError

  // Check if user is the ticket owner or assigned agent
  const canUpdate = 
    currentTicket.user_id === user.id || 
    currentTicket.assigned_to === user.id ||
    user.user_metadata?.role === 'admin'

  if (!canUpdate) {
    throw new Error('Unauthorized to update this ticket')
  }

  // Update the ticket
  const { data: updatedTicket, error: updateError } = await supabaseClient
    .from('tickets')
    .update({
      ...updates,
      last_agent_update: user.user_metadata?.role === 'user' ? currentTicket.last_agent_update : new Date().toISOString(),
      last_requester_update: user.user_metadata?.role === 'user' ? new Date().toISOString() : currentTicket.last_requester_update
    })
    .eq('id', id)
    .select()
    .single()

  if (updateError) throw updateError

  // Send notifications
  await notifyTicketUpdated(supabaseClient, updatedTicket, user, currentTicket.assigned_to)

  return new Response(
    JSON.stringify({ ticket: updatedTicket }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 
    }
  )
}

async function handleTicketList(req: Request, supabaseClient: any, user: any) {
  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const limit = parseInt(url.searchParams.get('limit') ?? '10')
  const offset = parseInt(url.searchParams.get('offset') ?? '0')

  let query = supabaseClient
    .from('tickets')
    .select(`
      *,
      creator:profiles!tickets_user_id_fkey (email),
      assignee:profiles!tickets_assigned_to_fkey (email)
    `)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  // Add filters
  if (status) {
    query = query.eq('status', status)
  }

  // If not admin/agent, only show user's tickets
  if (user.user_metadata?.role !== 'admin' && user.user_metadata?.role !== 'agent') {
    query = query.eq('user_id', user.id)
  }

  const { data: tickets, error } = await query

  if (error) throw error

  return new Response(
    JSON.stringify({ tickets }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 
    }
  )
} 