from typing import Dict, Any
from supabase import Client

async def notify_ticket_updated(
    supabase: Client,
    updated_ticket: Dict[str, Any],
    updater: Dict[str, Any],
    previous_ticket: Dict[str, Any]
) -> None:
    """
    Create a notification for ticket updates.
    """
    try:
        # Get ticket owner and assignee info
        owner_id = updated_ticket.get('user_id')
        assignee_id = updated_ticket.get('assigned_to')
        previous_assignee_id = previous_ticket.get('assigned_to')
        
        # Determine what changed
        changes = []
        for field in ['status', 'priority', 'assigned_to', 'group_name']:
            if updated_ticket.get(field) != previous_ticket.get(field):
                old_value = previous_ticket.get(field) or 'none'
                new_value = updated_ticket.get(field) or 'none'
                changes.append(f"{field.replace('_', ' ').title()}: {old_value} → {new_value}")
        
        if not changes:
            return
            
        change_text = ", ".join(changes)
        
        # Create notifications
        notification_data = {
            'type': 'ticket_updated',
            'ticket_id': updated_ticket['id'],
            'updater_id': updater['id'],
            'updater_name': updater['user_metadata'].get('full_name', 'Unknown'),
            'changes': change_text
        }
        
        # Notify ticket owner
        if owner_id and owner_id != updater['id']:
            await create_notification(supabase, {
                **notification_data,
                'user_id': owner_id,
                'message': f"Your ticket #{updated_ticket['id']} was updated: {change_text}"
            })
        
        # Notify previous assignee if changed
        if previous_assignee_id and previous_assignee_id != assignee_id and previous_assignee_id != updater['id']:
            await create_notification(supabase, {
                **notification_data,
                'user_id': previous_assignee_id,
                'message': f"Ticket #{updated_ticket['id']} was unassigned from you: {change_text}"
            })
        
        # Notify new assignee if changed
        if assignee_id and assignee_id != previous_assignee_id and assignee_id != updater['id']:
            await create_notification(supabase, {
                **notification_data,
                'user_id': assignee_id,
                'message': f"Ticket #{updated_ticket['id']} was assigned to you: {change_text}"
            })
            
    except Exception as e:
        print(f"Error creating notification: {str(e)}")

async def create_notification(supabase: Client, data: Dict[str, Any]) -> None:
    """
    Create a notification in the database.
    """
    try:
        await supabase.table('notifications').insert({
            'user_id': data['user_id'],
            'type': data['type'],
            'message': data['message'],
            'metadata': {
                'ticket_id': data['ticket_id'],
                'updater_id': data['updater_id'],
                'updater_name': data['updater_name'],
                'changes': data['changes']
            },
            'read': False,
            'created_at': 'now()'
        }).execute()
    except Exception as e:
        print(f"Error inserting notification: {str(e)}") 