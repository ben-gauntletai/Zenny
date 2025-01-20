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

    // Create the ticket using service role client to bypass RLS
    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: ticket, error: ticketError } = await serviceRoleClient
      .from('tickets')
      .insert({
        ...payload,
        user_id: user.id,
        status: 'open'
      })
      .select()
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

    // For now, we'll skip agent assignment since the last_assigned_at column doesn't exist
    await notifyTicketCreated(supabaseClient, ticket, user)

    return new Response(
      JSON.stringify({ ticket }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error) {
    console.error('Error in handleTicketCreation:', error)
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

    console.log('Handling ticket list request:', { 
      user_id: user.id, 
      user_email: user.email,
      user_metadata: user.user_metadata,
      status,
      limit,
      offset
    })

    // Get or create user profile
    const userProfile = await getUserProfile(supabaseClient, user)
    const effectiveRole = userProfile?.role || 'user'
    
    console.log('User profile and role:', {
      profile: userProfile,
      effectiveRole,
      isAdmin: effectiveRole === 'admin',
      isAgent: effectiveRole === 'agent'
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
        assignee:profiles!tickets_assigned_to_fkey (email, full_name)
      `)

    // Add filters
    if (status) {
      console.log('Applying status filter:', status)
      query.eq('status', status)
    }

    if (effectiveRole !== 'admin' && effectiveRole !== 'agent') {
      console.log('Restricting to user tickets:', {
        user_id: user.id,
        reason: 'User is not admin/agent'
      })
      query.eq('user_id', user.id)
    } else {
      console.log('Showing all tickets:', {
        reason: `User is ${effectiveRole}`
      })
    }

    // Add ordering and pagination
    query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Execute query
    const { data: tickets, error: queryError } = await query
    
    console.log('Query result:', {
      success: !queryError,
      ticketCount: tickets?.length,
      error: queryError,
      firstTicket: tickets?.[0],
      query: {
        filters: {
          user_id: effectiveRole !== 'admin' && effectiveRole !== 'agent' ? user.id : null,
          status: status || null
        },
        range: [offset, offset + limit - 1]
      }
    })

    if (queryError) {
      console.error('Error fetching tickets:', {
        error: queryError,
        message: queryError.message,
        details: queryError.details,
        code: queryError.code,
        hint: queryError.hint
      })
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

    console.log('Response data:', {
      ticketCount: transformedTickets.length,
      firstTicket: transformedTickets[0],
      userProfile,
      effectiveRole
    })

    return new Response(
      JSON.stringify({ tickets: transformedTickets }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error) {
    console.error('Error in handleTicketList:', {
      error,
      message: error.message,
      details: error.details || null,
      code: error.code || null,
      hint: error.hint || null
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
  // First try to get existing profile
  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('role, full_name, email')
    .eq('id', user.id)
    .maybeSingle()

  if (profile || profileError) {
    return profile
  }

  // If no profile exists, create one
  const userRole = user.user_metadata?.role || 'user'
  console.log('Creating new profile:', {
    id: user.id,
    email: user.email,
    role: userRole,
    full_name: user.user_metadata?.full_name
  })
  
  const serviceRoleClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  
  const { data: newProfile, error: insertError } = await serviceRoleClient
    .from('profiles')
    .upsert({
      id: user.id,
      email: user.email,
      role: userRole,
      full_name: user.user_metadata?.full_name || user.email
    })
    .select()
    .single()

  if (insertError) {
    console.error('Error creating profile:', insertError)
    throw insertError
  }

  console.log('Profile creation successful:', newProfile)
  return newProfile
} 