from typing import Dict, Any, List
from supabase import Client
from .formatting import format_ticket_numbers

def format_ticket_numbers(numbers: List[int]) -> str:
    """
    Convert a list of ticket numbers into a condensed range format.
    Example: [1,2,3,5,6,8] becomes "1-3, 5-6, 8"
    """
    if not numbers:
        return ""
    
    numbers = sorted(numbers)
    ranges = []
    range_start = numbers[0]
    prev = numbers[0]
    
    for i in range(1, len(numbers) + 1):
        if i == len(numbers) or numbers[i] != prev + 1:
            ranges.append(f"#{range_start}" if range_start == prev else f"#{range_start}-#{prev}")
            if i < len(numbers):
                range_start = numbers[i]
                prev = numbers[i]
        else:
            prev = numbers[i]
    
    return ", ".join(ranges)

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
                # Format field name
                formatted_field = ' '.join(word.title() for word in field.split('_'))
                
                # Get and format values
                old_value = previous_ticket.get(field)
                new_value = updated_ticket.get(field)
                
                # Special handling for assigned_to
                if field == 'assigned_to':
                    if old_value is None:
                        formatted_old = 'Unassigned'
                    else:
                        old_user = supabase.table('profiles').select('full_name,email').eq('id', old_value).single().execute()
                        old_data = old_user.data if old_user.data else None
                        formatted_old = old_data.get('full_name') or old_data.get('email') or 'Unknown user' if old_data else 'Unknown user'
                    
                    if new_value is None:
                        formatted_new = 'Unassigned'
                    else:
                        new_user = supabase.table('profiles').select('full_name,email').eq('id', new_value).single().execute()
                        new_data = new_user.data if new_user.data else None
                        formatted_new = new_data.get('full_name') or new_data.get('email') or 'Unknown user' if new_data else 'Unknown user'
                else:
                    # For other fields, capitalize first letter
                    formatted_old = str(old_value)[0].upper() + str(old_value)[1:] if old_value else 'None'
                    formatted_new = str(new_value)[0].upper() + str(new_value)[1:] if new_value else 'None'
                
                changes.append(f"{formatted_field}: {formatted_old} → {formatted_new}")
        
        if not changes:
            return
            
        change_text = ", ".join(changes)
        updater_name = updater['user_metadata'].get('full_name', 'Unknown')
        
        # Create notifications
        notification_data = {
            'type': 'TICKET_UPDATED',
            'ticket_id': updated_ticket['id']
        }
        
        # Format ticket number
        ticket_num = format_ticket_numbers([updated_ticket['id']])
        
        # Notify ticket owner
        if owner_id and owner_id != updater['id']:
            await create_notification(supabase, {
                **notification_data,
                'user_id': owner_id,
                'message': f"Your ticket {ticket_num} was updated by {updater_name}: {change_text}"
            })
            
        # Notify previous assignee if changed
        if previous_assignee_id and previous_assignee_id != assignee_id and previous_assignee_id != updater['id']:
            await create_notification(supabase, {
                **notification_data,
                'user_id': previous_assignee_id,
                'message': f"Ticket {ticket_num} was unassigned from you by {updater_name}: {change_text}"
            })
        
        # Notify new assignee if changed
        if assignee_id and assignee_id != previous_assignee_id and assignee_id != updater['id']:
            await create_notification(supabase, {
                **notification_data,
                'user_id': assignee_id,
                'message': f"Ticket {ticket_num} was assigned to you by {updater_name}: {change_text}"
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
            'title': data.get('type', 'Ticket Update').title(),
            'message': data['message'],
            'type': data['type'],
            'ticket_id': data['ticket_id'],
            'read': False
        }).execute()
    except Exception as e:
        print(f"Error inserting notification: {str(e)}") 