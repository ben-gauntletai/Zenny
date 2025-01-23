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

    // Handle different operations based on the request method
    switch (req.method) {
      case 'POST':
        return await handleTicketCreation(req, supabaseClient, user)
      case 'PUT':
        return await handleTicketUpdate(req, supabaseClient, user)
      case 'GET':
        return await handleTicketList(req, supabaseClient, user)
      default:
        throw new Error(`Unsupported method: ${req.method}`)
    }

  } catch (error) {
    console.error('Error in Edge Function:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.details || null
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

async function handleTicketCreation(req: Request, supabaseClient: any, user: any) {
  try {
    const payload: TicketCreationPayload = await req.json()
    
    console.log('Creating ticket with payload:', {
      payload,
      user_id: user.id,
      user_email: user.email,
      user_role: user.user_metadata?.role
    })

    // Validate payload
    if (!payload.subject || !payload.description || !payload.priority || !payload.ticket_type || !payload.topic) {
      const error = new Error('Missing required fields')
      console.error('Validation error:', {
        error,
        payload,
        missingFields: {
          subject: !payload.subject,
          description: !payload.description,
          priority: !payload.priority,
          ticket_type: !payload.ticket_type,
          topic: !payload.topic
        }
      })
      throw error
    }

    // Create a single service role client to use for all operations
    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log('Creating ticket using service role client')

    // Create the ticket
    const { data: ticket, error: ticketError } = await serviceRoleClient
      .from('tickets')
      .insert({
        ...payload,
        user_id: user.id,
        status: 'open'
      })
      .select(`
        *,
        profiles:user_id(email, full_name),
        agents:assigned_to(email, full_name)
      `)
      .single()

    if (ticketError) {
      console.error('Database error creating ticket:', {
        error: ticketError,
        message: ticketError.message,
        details: ticketError.details,
        code: ticketError.code,
        hint: ticketError.hint,
        payload,
        user: {
          id: user.id,
          email: user.email,
          role: user.user_metadata?.role
        }
      })
      throw ticketError
    }

    console.log('Ticket created successfully:', ticket)

    // Create notification using the same service role client
    try {
      console.log('Creating notification for ticket:', ticket.id)
      await notifyTicketCreated(serviceRoleClient, ticket, user)
      console.log('Notification created successfully')
    } catch (notificationError) {
      console.error('Error creating notification:', {
        error: notificationError,
        message: notificationError.message,
        details: notificationError.details,
        code: notificationError.code,
        hint: notificationError.hint,
        stack: notificationError.stack
      })
      // Don't throw the error, just log it - we still want to return the ticket
    }

    return new Response(
      JSON.stringify({ ticket, isNewTicket: true }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error) {
    console.error('Error in handleTicketCreation:', {
      error,
      message: error.message,
      stack: error.stack,
      details: error.details || null,
      code: error.code || null,
      hint: error.hint || null
    })
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.details || null,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
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
  try {
    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const limit = parseInt(url.searchParams.get('limit') ?? '10')
    const offset = parseInt(url.searchParams.get('offset') ?? '0')

    // Get or create user profile
    const userProfile = await getUserProfile(supabaseClient, user)
    const effectiveRole = userProfile?.role || user.user_metadata?.role || 'user'
    const isAgentOrAdmin = effectiveRole === 'admin' || effectiveRole === 'agent'
    
    console.log('DEBUG - Auth state:', {
      user_id: user.id,
      metadata_role: user.user_metadata?.role,
      profile_role: userProfile?.role,
      effective_role: effectiveRole,
      is_agent_or_admin: isAgentOrAdmin
    })

    // Use service role client to bypass RLS
    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Build the query
    const query = serviceRoleClient
      .from('tickets')
      .select(`
        *,
        creator:profiles!tickets_user_id_fkey (email, full_name),
        assignee:profiles!tickets_assigned_to_fkey (email, full_name, role)
      `)

    // Log query parameters before applying filters
    console.log('DEBUG - Query parameters:', {
      base_query: 'tickets with creator and assignee profiles',
      status_filter: status || 'none',
      user_filter: !isAgentOrAdmin ? user.id : 'none',
      user_role: userProfile?.role,
      pagination: { offset, limit },
      ordering: 'created_at DESC'
    })

    if (status) {
      query.eq('status', status)
    }

    if (!isAgentOrAdmin) {
      // Regular users can only see their own tickets
      query.eq('user_id', user.id)
    } else if (effectiveRole === 'agent') {
      // Agents can see all Support group tickets
      query.eq('group_name', 'Support')
    }
    // Admins can see all tickets

    // Add ordering and pagination
    query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Execute query
    const { data: tickets, error: queryError } = await query
    
    // Log query results for debugging
    console.log('DEBUG - Query results:', {
      success: !queryError,
      error: queryError ? {
        message: queryError.message,
        code: queryError.code
      } : null,
      ticket_count: tickets?.length || 0,
      sample_ticket: tickets?.[0] ? {
        id: tickets[0].id,
        subject: tickets[0].subject,
        user_id: tickets[0].user_id,
        status: tickets[0].status,
        assigned_to: tickets[0].assigned_to
      } : null
    })

    if (queryError) {
      throw queryError
    }

    // Transform the data to match the expected format
    const transformedTickets = tickets.map((ticket: any) => ({
      ...ticket,
      creator_email: ticket.creator?.email,
      creator_name: ticket.creator?.full_name,
      agent_email: ticket.assignee?.email,
      agent_name: ticket.assignee?.full_name
    }))

    return new Response(
      JSON.stringify({ tickets: transformedTickets }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error) {
    console.error('DEBUG - Error in handleTicketList:', {
      message: error.message,
      code: error.code || null,
      stack: error.stack
    })
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.details || null
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
}

async function getUserProfile(supabaseClient: any, user: any) {
  try {
    // Create service role client for profile operations
    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Fetching user profile with service role client');
    const { data: profile, error: profileError } = await serviceRoleClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', {
        message: profileError.message,
        code: profileError.code,
        details: profileError.details,
        hint: profileError.hint
      });
      throw profileError;
    }

    if (!profile) {
      console.log('Profile not found, creating new profile');
      const { data: newProfile, error: insertError } = await serviceRoleClient
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email,
          role: user.user_metadata?.role || 'user',
          full_name: user.user_metadata?.full_name || user.email
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating profile:', {
          error: insertError.message,
          userId: user.id
        });
        throw insertError;
      }

      console.log('New profile created:', newProfile);
      return newProfile;
    }

    console.log('Existing profile found:', profile);
    return profile;
  } catch (error) {
    console.error('Error in getUserProfile:', error);
    throw error;
  }
} 