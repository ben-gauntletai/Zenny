import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { notifyTicketCreated, notifyTicketUpdated } from '../_shared/notifications.ts';
import { corsHeaders } from '../_shared/cors.ts';
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request with headers:', {
      origin: req.headers.get('origin'),
      method: req.method,
      headers: Object.fromEntries(req.headers.entries())
    });
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
      'Access-Control-Max-Age': '86400'
    };
    console.log('Sending OPTIONS response with headers:', headers);
    return new Response(null, {
      status: 204,
      headers
    });
  }
  try {
    console.log('Request method:', req.method);
    console.log('Request headers:', Object.fromEntries(req.headers.entries()));
    // Create Supabase client
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // Get auth user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userError || !user) {
      throw new Error('Invalid token');
    }
    // Handle different operations based on the request method
    switch(req.method){
      case 'POST':
        // Check if this is a reply creation request
        const pathParts = new URL(req.url).pathname.split('/');
        if (pathParts[pathParts.length - 1] === 'replies') {
          return await handleReplyCreation(req, supabaseClient, user);
        }
        return await handleTicketCreation(req, supabaseClient, user);
      case 'PUT':
        return await handleTicketUpdate(req, supabaseClient, user);
      case 'GET':
        return await handleTicketList(req, supabaseClient, user);
      default:
        throw new Error(`Unsupported method: ${req.method}`);
    }
  } catch (error) {
    console.error('Error in Edge Function:', error);
    return new Response(JSON.stringify({
      error: error.message,
      details: error.details || null
    }), {
      status: error.message === 'No authorization header' ? 401 : 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
async function handleTicketCreation(req, supabaseClient, user) {
  try {
    const payload = await req.json();
    console.log('Creating ticket with payload:', {
      payload,
      user_id: user.id,
      user_email: user.email,
      user_role: user.user_metadata?.role
    });
    // Validate payload
    if (!payload.subject || !payload.description || !payload.priority || !payload.ticket_type || !payload.topic) {
      const error = new Error('Missing required fields');
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
      });
      throw error;
    }
    // Create a single service role client to use for all operations
    const serviceRoleClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    console.log('Creating ticket using service role client');
    // Create the ticket
    const { data: ticket, error: ticketError } = await serviceRoleClient.from('tickets').insert({
      ...payload,
      user_id: user.id,
      status: 'open'
    }).select(`
        *,
        profiles:user_id(email, full_name),
        agents:assigned_to(email, full_name)
      `).single();
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
      });
      throw ticketError;
    }
    console.log('Ticket created successfully:', ticket);
    // Create initial reply with ticket description
    const { error: replyError } = await serviceRoleClient.from('replies').insert({
      ticket_id: ticket.id,
      content: payload.description,
      user_id: user.id,
      is_public: true,
      created_at: ticket.created_at // Use same timestamp as ticket creation
    });
    if (replyError) {
      console.error('Error creating initial reply:', replyError);
    // Don't throw the error - we still want to return the ticket
    }
    // Create notification using the same service role client
    try {
      console.log('Creating notification for ticket:', ticket.id);
      await notifyTicketCreated(serviceRoleClient, ticket, user);
      console.log('Notification created successfully');
    } catch (notificationError) {
      console.error('Error creating notification:', {
        error: notificationError,
        message: notificationError.message,
        details: notificationError.details,
        code: notificationError.code,
        hint: notificationError.hint,
        stack: notificationError.stack
      });
    // Don't throw the error, just log it - we still want to return the ticket
    }
    return new Response(JSON.stringify({
      ticket,
      isNewTicket: true
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('Error in handleTicketCreation:', {
      error,
      message: error.message,
      stack: error.stack,
      details: error.details || null,
      code: error.code || null,
      hint: error.hint || null
    });
    return new Response(JSON.stringify({
      error: error.message,
      details: error.details || null,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
}
async function handleTicketUpdate(req, supabaseClient, user) {
  try {
    // Extract ticket ID from URL path
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const ticketId = parseInt(pathParts[pathParts.length - 1]);
    
    if (!ticketId || isNaN(ticketId)) {
      throw new Error('Invalid ticket ID');
    }

    // Get updates from request body
    const updates = await req.json();

    console.log('Updating ticket:', {
      ticketId,
      updates,
      userId: user.id,
      userRole: user.user_metadata?.role
    });

    // Get current ticket state
    const { data: currentTicket, error: ticketError } = await supabaseClient
      .from('tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (ticketError) {
      console.error('Error fetching current ticket:', ticketError);
      throw ticketError;
    }

    // Get user's role from metadata
    const userRole = user.user_metadata?.role || 'user';
    console.log('User role check:', {
      userId: user.id,
      userRole,
      isTicketOwner: currentTicket.user_id === user.id,
      isAssignedAgent: currentTicket.assigned_to === user.id,
      metadata: user.user_metadata
    });

    // Check if user is authorized to update
    const canUpdate = 
      userRole === 'admin' || 
      userRole === 'agent' ||
      currentTicket.user_id === user.id;

    if (!canUpdate) {
      console.error('Unauthorized update attempt:', {
        userId: user.id,
        userRole,
        ticketOwnerId: currentTicket.user_id,
        assignedTo: currentTicket.assigned_to
      });
      throw new Error('Unauthorized to update this ticket');
    }

    // Ensure tags is properly formatted as a JSONB array
    const formattedUpdates = {
      ...updates,
      tags: updates.tags ? JSON.parse(updates.tags) : updates.tags
    };

    // Update the ticket
    const { data: updatedTicket, error: updateError } = await supabaseClient
      .from('tickets')
      .update({
        ...formattedUpdates,
        last_agent_update: user.user_metadata?.role === 'user' ? currentTicket.last_agent_update : new Date().toISOString(),
        last_requester_update: user.user_metadata?.role === 'user' ? new Date().toISOString() : currentTicket.last_requester_update
      })
      .eq('id', ticketId)
      .select(`
        *,
        profiles:user_id(
          id,
          email,
          full_name,
          avatar_url,
          role
        ),
        agents:assigned_to(
          id,
          email,
          full_name,
          role,
          avatar_url
        )
      `)
      .single();

    if (updateError) {
      console.error('Error updating ticket:', updateError);
      throw updateError;
    }

    // Send notifications
    await notifyTicketUpdated(supabaseClient, updatedTicket, user, currentTicket.assigned_to);

    return new Response(JSON.stringify({
      ticket: updatedTicket
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('Error in handleTicketUpdate:', error);
    return new Response(JSON.stringify({
      error: error.message,
      details: error.details || null
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
}
async function handleTicketList(req, supabaseClient, user) {
  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const ticketId = pathParts[pathParts.length - 1];
    // If ticketId is provided, fetch single ticket with replies
    if (ticketId && !isNaN(parseInt(ticketId))) {
      console.log('Fetching single ticket:', ticketId);
      // First fetch the ticket with user profiles
      const { data: ticket, error: ticketError } = await supabaseClient.from('tickets').select(`
          *,
          profiles:user_id(
            id,
            email,
            full_name,
            avatar_url,
            role
          ),
          agents:assigned_to(
            id,
            email,
            full_name,
            role,
            avatar_url
          )
        `).eq('id', ticketId).single();
      if (ticketError) {
        console.error('Error fetching ticket:', ticketError);
        throw ticketError;
      }
      // Then fetch replies for this ticket
      const { data: replies, error: repliesError } = await supabaseClient.from('replies').select(`
          *,
          user_profile:profiles!replies_user_id_fkey (
            email,
            full_name,
            avatar_url,
            role
          )
        `).eq('ticket_id', ticketId).order('created_at', {
        ascending: true
      });
      if (repliesError) {
        console.error('Error fetching replies:', repliesError);
        throw repliesError;
      }
      // Filter out the initial reply if it matches the description
      const filteredReplies = replies.filter((reply)=>{
        const isInitialReply = reply.content === ticket.description && reply.user_id === ticket.user_id && Math.abs(new Date(reply.created_at).getTime() - new Date(ticket.created_at).getTime()) < 1000;
        return !isInitialReply;
      });
      // Format the response
      const response = {
        ticket: {
          ...ticket,
          profiles: ticket.profiles,
          agents: ticket.agents,
          requester_id: ticket.user_id,
          requester_email: ticket.profiles?.email,
          requester_name: ticket.profiles?.full_name,
          requester_avatar: ticket.profiles?.avatar_url,
          requester_role: ticket.profiles?.role,
          agent_email: ticket.agents?.email,
          agent_name: ticket.agents?.full_name,
          agent_avatar: ticket.agents?.avatar_url,
          agent_role: ticket.agents?.role
        },
        replies: filteredReplies.map((reply)=>({
            ...reply,
            user_email: reply.user_profile?.email,
            user_name: reply.user_profile?.full_name,
            user_avatar: reply.user_profile?.avatar_url,
            user_role: reply.user_profile?.role
          }))
      };
      return new Response(JSON.stringify(response), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 200
      });
    }
    const status = url.searchParams.get('status');
    const limit = parseInt(url.searchParams.get('limit') ?? '10');
    const offset = parseInt(url.searchParams.get('offset') ?? '0');
    // Get or create user profile
    const userProfile = await getUserProfile(supabaseClient, user);
    const effectiveRole = userProfile?.role || user.user_metadata?.role || 'user';
    const isAgentOrAdmin = effectiveRole === 'admin' || effectiveRole === 'agent';
    console.log('DEBUG - Auth state:', {
      user_id: user.id,
      metadata_role: user.user_metadata?.role,
      profile_role: userProfile?.role,
      effective_role: effectiveRole,
      is_agent_or_admin: isAgentOrAdmin
    });

    // Build the query using the regular client to enforce RLS
    const query = supabaseClient.from('tickets').select(`
        *,
        requester:profiles!tickets_user_id_fkey (email, full_name, avatar_url, role),
        assignee:profiles!tickets_assigned_to_fkey (email, full_name, role, avatar_url)
      `);

    // Log query parameters before applying filters
    console.log('DEBUG - Query parameters:', {
      base_query: 'tickets with requester and assignee profiles',
      status_filter: status || 'none',
      user_filter: !isAgentOrAdmin ? user.id : 'none',
      user_role: userProfile?.role,
      pagination: {
        offset,
        limit
      },
      ordering: 'created_at DESC'
    });

    if (status) {
      query.eq('status', status);
    }

    // Add ordering and pagination
    query.order('created_at', {
      ascending: false
    }).range(offset, offset + limit - 1);

    // Execute query
    const { data: tickets, error: queryError } = await query;
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
    });
    if (queryError) {
      throw queryError;
    }
    // Transform the data to match the expected format
    const transformedTickets = tickets.map((ticket)=>({
        ...ticket,
        requester_id: ticket.user_id,
        requester_email: ticket.requester?.email,
        requester_name: ticket.requester?.full_name,
        requester_role: ticket.requester?.role,
        agent_email: ticket.assignee?.email,
        agent_name: ticket.assignee?.full_name,
        agent_role: ticket.assignee?.role
      }));
    return new Response(JSON.stringify({
      tickets: transformedTickets
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('DEBUG - Error in handleTicketList:', {
      message: error.message,
      code: error.code || null,
      stack: error.stack
    });
    return new Response(JSON.stringify({
      error: error.message,
      details: error.details || null
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
}
async function getUserProfile(supabaseClient, user) {
  try {
    // Create service role client for profile operations
    const serviceRoleClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    console.log('Fetching user profile with service role client');
    const { data: profile, error: profileError } = await serviceRoleClient.from('profiles').select('*, avatar_url').eq('id', user.id).single();
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
      const { data: newProfile, error: insertError } = await serviceRoleClient.from('profiles').upsert({
        id: user.id,
        email: user.email,
        role: user.user_metadata?.role || 'user',
        full_name: user.user_metadata?.full_name || user.email,
        avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`
      }).select().single();
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
async function handleReplyCreation(req, supabaseClient, user) {
  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const ticketId = parseInt(pathParts[pathParts.length - 2]);
    if (!ticketId || isNaN(ticketId)) {
      throw new Error('Invalid ticket ID');
    }
    const { content, is_public = true } = await req.json();
    if (!content) {
      throw new Error('Content is required');
    }
    console.log('Creating reply:', {
      ticketId,
      content,
      is_public,
      user_id: user.id
    });
    // Create service role client
    const serviceRoleClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // Create the reply
    const { data: reply, error: replyError } = await serviceRoleClient.from('replies').insert({
      ticket_id: ticketId,
      content,
      user_id: user.id,
      is_public
    }).select(`
        *,
        user_profile:profiles!replies_user_id_fkey (
          email,
          full_name,
          avatar_url,
          role
        )
      `).single();
    if (replyError) {
      console.error('Error creating reply:', replyError);
      throw replyError;
    }
    // Format the response
    const formattedReply = {
      ...reply,
      user_email: reply.user_profile?.email,
      user_name: reply.user_profile?.full_name,
      user_avatar: reply.user_profile?.avatar_url,
      user_role: reply.user_profile?.role
    };
    return new Response(JSON.stringify({
      reply: formattedReply
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('Error in handleReplyCreation:', error);
    return new Response(JSON.stringify({
      error: error.message,
      details: error.details || null
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
}
