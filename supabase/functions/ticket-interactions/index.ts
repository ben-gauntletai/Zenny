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
}

function formatChangesMessage(changes: TicketChange[]): { title: string; message: string } {
  const title = 'Ticket Updated'
  const changeMessages = changes.map(change => 
    `Changed ${change.field} from "${change.oldValue}" to "${change.newValue}"`
  )
  return {
    title,
    message: changeMessages.join('\n')
  }
}

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

    // Format changes into title and message
    const { title, message } = formatChangesMessage(changes)

    // Create notification
    const { data: notification, error: notificationError } = await supabaseClient
      .from('notifications')
      .insert({
        ticket_id: ticketId,
        user_id: userId,
        type,
        title,
        message,
        read: false
      })
      .select()
      .single()

    if (notificationError) {
      throw notificationError
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
      JSON.stringify({ notification, ticket }),
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