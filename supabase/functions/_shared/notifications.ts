interface NotificationPayload {
  user_id: string;
  title: string;
  message: string;
  type: 'TICKET_CREATED' | 'TICKET_UPDATED' | 'TICKET_ASSIGNED' | 'COMMENT_ADDED';
  ticket_id?: number;
}

export async function createNotification(
  supabaseClient: any,
  payload: NotificationPayload
) {
  const { error } = await supabaseClient
    .from('notifications')
    .insert({
      user_id: payload.user_id,
      title: payload.title,
      message: payload.message,
      type: payload.type,
      ticket_id: payload.ticket_id,
      read: false
    });

  if (error) throw error;
}

export async function notifyTicketCreated(
  supabaseClient: any,
  ticket: any,
  creator: any
) {
  // Notify assigned agent if exists
  if (ticket.assigned_to) {
    await createNotification(supabaseClient, {
      user_id: ticket.assigned_to,
      title: 'New Ticket Assigned',
      message: `Ticket "${ticket.subject}" has been assigned to you by ${creator.email}`,
      type: 'TICKET_ASSIGNED',
      ticket_id: ticket.id
    });
  }

  // Notify all agents if unassigned
  else {
    const { data: agents } = await supabaseClient
      .from('profiles')
      .select('id')
      .eq('role', 'agent');

    if (agents) {
      for (const agent of agents) {
        await createNotification(supabaseClient, {
          user_id: agent.id,
          title: 'New Unassigned Ticket',
          message: `New ticket "${ticket.subject}" needs assignment`,
          type: 'TICKET_CREATED',
          ticket_id: ticket.id
        });
      }
    }
  }
}

export async function notifyTicketUpdated(
  supabaseClient: any,
  ticket: any,
  updater: any,
  previousAssignee?: string
) {
  // Notify ticket owner if updater is different
  if (ticket.user_id !== updater.id) {
    await createNotification(supabaseClient, {
      user_id: ticket.user_id,
      title: 'Ticket Updated',
      message: `Your ticket "${ticket.subject}" has been updated`,
      type: 'TICKET_UPDATED',
      ticket_id: ticket.id
    });
  }

  // Notify new assignee if assignment changed
  if (ticket.assigned_to && ticket.assigned_to !== previousAssignee) {
    await createNotification(supabaseClient, {
      user_id: ticket.assigned_to,
      title: 'Ticket Assigned',
      message: `Ticket "${ticket.subject}" has been assigned to you`,
      type: 'TICKET_ASSIGNED',
      ticket_id: ticket.id
    });
  }
} 