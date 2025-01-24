import { supabase } from '../lib/supabaseClient';

const EDGE_FUNCTION_URL = process.env.REACT_APP_SUPABASE_URL + '/functions/v1/tickets';

interface TicketCreationPayload {
  subject: string;
  description: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  ticket_type: 'question' | 'incident' | 'problem' | 'task';
  topic: 'ISSUE' | 'INQUIRY' | 'OTHER' | 'PAYMENTS' | 'NONE';
}

export const ticketService = {
  async createTicket(payload: TicketCreationPayload) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No active session');

    console.log('Sending ticket creation request:', {
      payload,
      url: EDGE_FUNCTION_URL
    });

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let errorMessage = `Failed to create ticket: ${response.status}`;
      try {
        const errorData = await response.json();
        console.error('Server error response:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
          payload
        });
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch (parseError) {
        console.error('Error parsing error response:', {
          parseError,
          status: response.status,
          statusText: response.statusText,
          payload
        });
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('Ticket created successfully:', data);
    
    // Add isNewTicket flag to the ticket data
    if (data.ticket) {
      data.ticket.isNewTicket = true;
    }
    
    return data;
  },

  async updateTicket(id: number, updates: Partial<TicketCreationPayload>) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No active session');

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id, ...updates })
    });

    if (!response.ok) {
      try {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update ticket');
      } catch {
        throw new Error(`Failed to update ticket: ${response.status}`);
      }
    }

    return response.json();
  },

  async listTickets(params: { status?: string; limit?: number; offset?: number } = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No active session');

    // Debug logging for authentication
    console.log('Auth Debug:', {
      user: session.user,
      role: session.user.user_metadata?.role,
      id: session.user.id,
      email: session.user.email
    });

    let query = supabase
      .from('tickets')
      .select(`
        *,
        creator:profiles!tickets_user_id_fkey (
          id,
          email,
          full_name,
          role,
          avatar_url
        ),
        agent:profiles!tickets_assigned_to_fkey (
          id,
          email,
          full_name,
          role,
          avatar_url
        )
      `);

    // Apply additional filters
    if (params.status) {
      query = query.eq('status', params.status);
    }

    // Add ordering
    query = query.order('created_at', { ascending: false });

    // Add pagination
    if (params.limit) {
      query = query.limit(params.limit);
    }

    if (params.offset) {
      query = query.range(params.offset, params.offset + (params.limit || 10) - 1);
    }

    // Debug logging for query
    console.log('Query Debug:', {
      params: params,
      hasStatus: !!params.status,
      limit: params.limit,
      offset: params.offset
    });

    const { data, error } = await query;

    // Debug logging for results
    console.log('Results Debug:', {
      success: !error,
      error: error ? {
        message: error.message,
        code: error.code,
        details: error.details
      } : null,
      ticketCount: data?.length || 0,
      sampleTicket: data?.[0] ? {
        id: data[0].id,
        subject: data[0].subject,
        status: data[0].status,
        group_name: data[0].group_name,
        assigned_to: data[0].assigned_to
      } : null
    });

    if (error) {
      console.error('Error fetching tickets:', error);
      throw error;
    }

    // Transform the data to match the expected format
    const transformedTickets = data?.map(ticket => ({
      ...ticket,
      creator_email: ticket.creator?.email,
      creator_name: ticket.creator?.full_name,
      creator_role: ticket.creator?.role,
      creator_avatar: ticket.creator?.avatar_url,
      agent_email: ticket.agent?.email,
      agent_name: ticket.agent?.full_name,
      agent_role: ticket.agent?.role,
      agent_avatar: ticket.agent?.avatar_url
    })) || [];

    console.log('Transformed tickets:', transformedTickets);
    return { tickets: transformedTickets };
  }
}; 