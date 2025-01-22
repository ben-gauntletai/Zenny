import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface TicketChange {
  field: string;
  oldValue: any;
  newValue: any;
}

interface TicketInteractionPayload {
  ticketId: number;
  userId: string;
  changes: TicketChange[];
  type: 'TICKET_CREATED' | 'TICKET_UPDATED' | 'TICKET_ASSIGNED' | 'COMMENT_ADDED';
  isNewTicket: boolean;
}

function getChangeTitle(field: string): string {
  const fieldLower = field.toLowerCase()
  switch (fieldLower) {
    case 'assigned_to':
      return 'Ticket Assignment'
    case 'comment':
      return 'New Comment'
    case 'status':
      return 'Status Update'
    case 'priority':
      return 'Priority Update'
    case 'type':
    case 'ticket_type':
      return 'Type Update'
    case 'topic':
      return 'Topic Update'
    case 'tags':
      return 'Tags Update'
    default:
      return 'Ticket Updated'
  }
}

function formatFieldName(field: string): string {
  // Special cases for multi-word fields
  switch (field) {
    case 'assigned_to':
      return 'Assignee';
    case 'ticket_type':
    case 'type':
      return 'Ticket type';
    default:
      // Capitalize first letter and replace underscores with spaces
      return field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' ');
  }
}

function capitalizeValue(value: any): string {
  if (value === null || value === undefined) return 'None';
  return value.toString().charAt(0).toUpperCase() + value.toString().slice(1).toLowerCase();
}

const formatChangeMessage = async (field: string, oldValue: any, newValue: any, supabaseClient: any) => {
  switch (field) {
    case 'assigned_to':
      if (!newValue || newValue === '') {
        return 'Ticket Assignment changed to Unassigned';
      }
      const { data: assignee } = await supabaseClient
        .from('profiles')
        .select('full_name, email')
        .eq('id', newValue)
        .single();
      return `Ticket Assignment changed to ${assignee?.full_name || assignee?.email || 'Unknown user'}`;
    case 'tags':
      return 'Tags were updated';
    case 'comment':
      return 'New comment added';
    case 'type':
    case 'ticket_type':
      return `Ticket type changed from ${capitalizeValue(oldValue)} to ${capitalizeValue(newValue)}`;
    default:
      return `${formatFieldName(field)} changed from ${capitalizeValue(oldValue)} to ${capitalizeValue(newValue)}`;
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables')
    }

    const supabaseClient = createClient(supabaseUrl, supabaseKey)
    const payload: TicketInteractionPayload = await req.json()
    const { ticketId, userId, changes, type } = payload

    // Validate payload
    if (!ticketId || !userId || !type) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create a notification for each change
    const notifications = []

    // Skip all notifications if this is a new ticket
    if (type === 'TICKET_CREATED' || payload.isNewTicket) {
      return new Response(
        JSON.stringify({ notifications: [], ticket: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    for (const change of changes) {
      const { data: notification, error: notificationError } = await supabaseClient
        .from('notifications')
        .insert({
          ticket_id: ticketId,
          user_id: userId,
          type,
          title: getChangeTitle(change.field),
          message: await formatChangeMessage(change.field, change.oldValue, change.newValue, supabaseClient),
          read: false
        })
        .select()
        .single()

      if (notificationError) {
        throw notificationError
      }

      notifications.push(notification)
    }

    // Get updated ticket
    const { data: ticket, error: ticketError } = await supabaseClient
      .from('tickets')
      .select(`
        *,
        profiles:user_id(email, full_name),
        agents:assigned_to(email, full_name)
      `)
      .eq('id', ticketId)
      .single()

    if (ticketError) {
      throw ticketError
    }

    return new Response(
      JSON.stringify({ notifications, ticket }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.details || null,
        type: error.constructor.name
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}) 