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
  previousTicket: any
) {
  try {
    console.log('Starting notifyTicketUpdated with:', {
      ticket_id: ticket.id,
      updater_id: updater.id,
      previous_ticket: previousTicket,
      current_ticket: ticket,
      ticket_updates: ticket
    });

    // Create individual notifications for each change
    const notifications = [];

    // Get updater's name for context
    const updaterName = updater.user_metadata?.full_name || updater.email || 'A user';

    // Helper function to format field values
    const formatFieldValue = (field: string, value: string) => {
      if (!value) return value;
      
      switch (field) {
        case 'status':
          return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
        case 'priority':
          return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
        case 'ticket_type':
          return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
        case 'topic':
          switch (value) {
            case 'ISSUE': return 'Issue';
            case 'INQUIRY': return 'Inquiry';
            case 'PAYMENTS': return 'Payments';
            case 'OTHER': return 'Other';
            case 'NONE': return 'None';
            default: return value;
          }
        case 'group_name':
          return value; // Already in correct format (Support/Admin)
        default:
          return value;
      }
    };

    // Get the actual changes by comparing fields
    const changes = Object.keys(ticket).reduce((acc: any[], key) => {
      // Skip internal fields that shouldn't trigger notifications
      if (['created_at', 'updated_at', 'last_agent_update', 'last_requester_update'].includes(key)) {
        return acc;
      }

      // Special handling for tags
      if (key === 'tags') {
        const currentTags = Array.isArray(previousTicket[key]) 
          ? previousTicket[key] 
          : JSON.parse(previousTicket[key] || '[]');
        const newTags = Array.isArray(ticket[key])
          ? ticket[key]
          : JSON.parse(ticket[key] || '[]');

        // Normalize arrays for comparison
        const normalizeTagArray = (tags: any[]) => 
          tags.filter(tag => tag && tag.trim()).map(tag => tag.trim()).sort();

        const normalizedCurrentTags = normalizeTagArray(currentTags);
        const normalizedNewTags = normalizeTagArray(newTags);

        // Only add to changes if tags are actually different
        if (normalizedCurrentTags.length !== normalizedNewTags.length ||
            normalizedCurrentTags.some((tag, index) => tag !== normalizedNewTags[index])) {
          acc.push({
            field: key,
            oldValue: normalizedCurrentTags,
            newValue: normalizedNewTags
          });
        }
      } else if (ticket[key] !== previousTicket[key]) {
        acc.push({
          field: key,
          oldValue: previousTicket[key],
          newValue: ticket[key]
        });
      }
      return acc;
    }, []);

    console.log('Detected changes:', changes);

    // Create a unique key for each notification to prevent duplicates
    const notificationKeys = new Set();

    // Create notifications only for fields that have actually changed
    for (const change of changes) {
      const formattedNewValue = formatFieldValue(change.field, change.newValue);
      let notificationKey;
      let notification;
      
      switch (change.field) {
        case 'status':
          notificationKey = `status_${change.newValue}_${ticket.id}`;
          notification = {
            user_id: null,
            title: 'Status Update',
            message: `${updaterName} changed the status to "${formattedNewValue}"`,
            type: 'TICKET_UPDATED',
            ticket_id: ticket.id
          };
          break;

        case 'priority':
          notificationKey = `priority_${change.newValue}_${ticket.id}`;
          notification = {
            user_id: null,
            title: 'Priority Update',
            message: `${updaterName} set the priority to "${formattedNewValue}"`,
            type: 'TICKET_UPDATED',
            ticket_id: ticket.id
          };
          break;

        case 'ticket_type':
          notificationKey = `type_${change.newValue}_${ticket.id}`;
          notification = {
            user_id: null,
            title: 'Type Update',
            message: `${updaterName} set the type to "${formattedNewValue}"`,
            type: 'TICKET_UPDATED',
            ticket_id: ticket.id
          };
          break;

        case 'topic':
          notificationKey = `topic_${change.newValue}_${ticket.id}`;
          notification = {
            user_id: null,
            title: 'Topic Update',
            message: `${updaterName} set the topic to "${formattedNewValue}"`,
            type: 'TICKET_UPDATED',
            ticket_id: ticket.id
          };
          break;

        case 'group_name':
          notificationKey = `group_${change.newValue}_${ticket.id}`;
          notification = {
            user_id: null,
            title: 'Group Update',
            message: `${updaterName} set the group to "${formattedNewValue}"`,
            type: 'TICKET_UPDATED',
            ticket_id: ticket.id
          };
          break;

        case 'subject':
          notificationKey = `subject_${ticket.id}`;
          notification = {
            user_id: null,
            title: 'Subject Update',
            message: `${updaterName} updated the subject to "${change.newValue}"`,
            type: 'TICKET_UPDATED',
            ticket_id: ticket.id
          };
          break;

        case 'tags':
          notificationKey = `tags_${JSON.stringify(change.newValue)}_${ticket.id}`;
          const tagsMessage = change.newValue?.length > 0
            ? `${updaterName} updated the tags to: ${change.newValue.join(', ')}`
            : `${updaterName} removed all tags`;
          
          notification = {
            user_id: null,
            title: 'Tags Update',
            message: tagsMessage,
            type: 'TICKET_UPDATED',
            ticket_id: ticket.id
          };
          break;

        case 'assigned_to':
          notificationKey = `assigned_${change.newValue || 'unassigned'}_${ticket.id}`;
          let message;
          if (!change.newValue) {
            message = `${updaterName} unassigned the ticket`;
          } else {
            // Get the new assignee's name
            const { data: assignee } = await supabaseClient
              .from('profiles')
              .select('full_name, email')
              .eq('id', change.newValue)
              .single();

            const assigneeName = assignee?.full_name || assignee?.email || 'Unknown user';
            message = `${updaterName} assigned the ticket to ${assigneeName}`;
          }

          notification = {
            user_id: null,
            title: 'Assignment Update',
            message,
            type: 'TICKET_UPDATED',
            ticket_id: ticket.id
          };

          // Add notification to the list if it's unique
          if (!notificationKeys.has(notificationKey)) {
            notificationKeys.add(notificationKey);
            notifications.push(notification);
          }

          // Also notify the new assignee
          if (change.newValue) {
            const assigneeNotificationKey = `assigned_to_me_${change.newValue}_${ticket.id}`;
            if (!notificationKeys.has(assigneeNotificationKey)) {
              notificationKeys.add(assigneeNotificationKey);
              notifications.push({
                user_id: change.newValue,
                title: 'Ticket Assigned',
                message: `Ticket "${ticket.subject}" has been assigned to you`,
                type: 'TICKET_ASSIGNED',
                ticket_id: ticket.id
              });
            }
          }
          continue; // Skip the default notification addition since we handled it specially
      }

      // Add notification to the list if it's unique
      if (notification && !notificationKeys.has(notificationKey)) {
        notificationKeys.add(notificationKey);
        notifications.push(notification);
      }
    }

    // Insert all notifications at once
    if (notifications.length > 0) {
      console.log('Creating notifications:', notifications);
      const { error: notificationError } = await supabaseClient
        .from('notifications')
        .insert(notifications);

      if (notificationError) {
        console.error('Error creating notifications:', notificationError);
        throw notificationError;
      }

      console.log(`Successfully created ${notifications.length} notifications`);
    }

  } catch (error) {
    console.error('Error in notifyTicketUpdated:', error);
    throw error;
  }
} 