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
 */

// Notification types and interfaces for the ticket system
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
  try {
    console.log('Starting notifyTicketCreated with:', {
      ticket_id: ticket.id,
      creator_id: creator.id,
      client_type: supabaseClient.auth.admin ? 'service_role' : 'regular'
    });

    // Create a single notification without deleting existing ones first
    const { data: notification, error: insertError } = await supabaseClient
      .from('notifications')
      .insert({
        user_id: null,  // NULL user_id means this is a system notification visible to agents/admins
        title: 'New Unassigned Ticket',
        message: `New ticket '${ticket.subject}' needs assignment`,
        type: 'TICKET_CREATED',
        ticket_id: ticket.id,
        read: false
      })
      .select()
      .single();

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

export async function notifyTicketUpdated(
  supabaseClient: any,
  ticket: any,
  updater: any,
  previousAssignee?: string
) {
  try {
    console.log('Starting notifyTicketUpdated with:', {
      ticket_id: ticket.id,
      updater_id: updater.id,
      previous_assignee: previousAssignee,
      current_assignee: ticket.assigned_to
    });

    // Create individual notifications for each change
    const notifications = [];

    // Get updater's name for context
    const updaterName = updater.user_metadata?.full_name || updater.email || 'A user';

    if (ticket.status) {
      notifications.push({
        user_id: null, // null user_id means visible to all in interaction history
        title: 'Status Update',
        message: `${updaterName} changed the status to "${ticket.status}"`,
        type: 'TICKET_UPDATED',
        ticket_id: ticket.id
      });
    }

    if (ticket.priority) {
      notifications.push({
        user_id: null,
        title: 'Priority Update',
        message: `${updaterName} set the priority to "${ticket.priority}"`,
        type: 'TICKET_UPDATED',
        ticket_id: ticket.id
      });
    }

    if (ticket.ticket_type) {
      notifications.push({
        user_id: null,
        title: 'Type Update',
        message: `${updaterName} changed the type to "${ticket.ticket_type}"`,
        type: 'TICKET_UPDATED',
        ticket_id: ticket.id
      });
    }

    if (ticket.topic) {
      notifications.push({
        user_id: null,
        title: 'Topic Update',
        message: `${updaterName} set the topic to "${ticket.topic}"`,
        type: 'TICKET_UPDATED',
        ticket_id: ticket.id
      });
    }

    if (ticket.tags && ticket.tags.length > 0) {
      notifications.push({
        user_id: null,
        title: 'Tags Update',
        message: `${updaterName} updated the tags to: ${ticket.tags.join(', ')}`,
        type: 'TICKET_UPDATED',
        ticket_id: ticket.id
      });
    }

    // Handle assignment changes
    if (ticket.assigned_to && ticket.assigned_to !== previousAssignee) {
      // Try to get the new assignee's email
      const { data: assigneeData } = await supabaseClient
        .from('auth.users')
        .select('email, user_metadata->full_name')
        .eq('id', ticket.assigned_to)
        .single();

      const assigneeName = assigneeData?.user_metadata?.full_name || assigneeData?.email || 'a new agent';
      
      notifications.push({
        user_id: null,
        title: 'Assignment Update',
        message: `${updaterName} assigned the ticket to ${assigneeName}`,
        type: 'TICKET_ASSIGNED',
        ticket_id: ticket.id
      });
    }

    // Create all notifications
    for (const notification of notifications) {
      await createNotification(supabaseClient, notification);
    }

    console.log('Successfully created update notifications:', notifications.length);
  } catch (error) {
    console.error('Error in notifyTicketUpdated:', {
      error,
      message: error.message,
      stack: error.stack,
      ticket_id: ticket?.id,
      updater_id: updater?.id
    });
    throw error;
  }
} 