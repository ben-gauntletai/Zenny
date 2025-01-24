/**
 * Notification system for the ticket management system
 * Handles creation and management of notifications for:
 * - New ticket creation
 * - Ticket updates
 * - Ticket assignments
 * - Comments
 * 
 * @version 1.0.1
 * @lastUpdated 2025-01-22
 * @author AutoCRM Team
 */ // Notification types and interfaces for the ticket system
export async function createNotification(supabaseClient, payload) {
  const { error } = await supabaseClient.from('notifications').insert({
    user_id: payload.user_id,
    title: payload.title,
    message: payload.message,
    type: payload.type,
    ticket_id: payload.ticket_id,
    read: false
  });
  if (error) throw error;
}
export async function notifyTicketCreated(supabaseClient, ticket, creator) {
  try {
    console.log('Starting notifyTicketCreated with:', {
      ticket_id: ticket.id,
      creator_id: creator.id,
      client_type: supabaseClient.auth.admin ? 'service_role' : 'regular'
    });
    // Create a single notification without deleting existing ones first
    const { data: notification, error: insertError } = await supabaseClient.from('notifications').insert({
      user_id: null,
      title: 'New Unassigned Ticket',
      message: `New ticket '${ticket.subject}' needs assignment`,
      type: 'TICKET_CREATED',
      ticket_id: ticket.id,
      read: false
    }).select().single();
    if (insertError) {
      console.error('Error creating notification:', {
        error: insertError,
        message: insertError.message,
        details: insertError.details,
        code: insertError.code,
        hint: insertError.hint,
        payload: {
          ticket_id: ticket.id,
          subject: ticket.subject
        }
      });
      throw insertError;
    }
    console.log('Successfully created notification:', notification);
    return notification;
  } catch (error) {
    console.error('Unexpected error in notifyTicketCreated:', {
      error,
      message: error.message,
      stack: error.stack,
      ticket_id: ticket?.id,
      creator_id: creator?.id
    });
    throw error;
  }
}
export async function notifyTicketUpdated(supabaseClient, ticket, updater, previousAssignee) {
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
