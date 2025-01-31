from typing import Dict, Any, List
from supabase import Client
from .formatting import format_ticket_numbers
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

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

async def create_notification(supabase: Client, payload: Dict[str, Any]) -> None:
    """
    Create a notification in the database.
    """
    try:
        # Create notification
        result = supabase.table('notifications').insert({
            'user_id': payload['user_id'],
            'title': payload['title'],
            'message': payload['message'],
            'type': payload['type'],
            'ticket_id': payload.get('ticket_id'),
            'read': False
        }).execute()
        
        if result.error:
            print(f"Error inserting notification: {result.error}")
            raise result.error
            
    except Exception as e:
        print(f"Error creating notification: {str(e)}")
        raise e

async def notify_ticket_updated(supabase_client, ticket_id):
    try:
        # Get ticket details
        ticket_result = supabase_client.table('tickets').select('''
            *,
            user:profiles!tickets_user_id_fkey (email, full_name),
            agent:profiles!tickets_assigned_to_fkey (email, full_name)
        ''').eq('id', ticket_id).single().execute()
        
        if ticket_result.error:
            logger.error('Error fetching ticket details: %s', ticket_result.error)
            return
            
        ticket = ticket_result.data
        if not ticket:
            logger.error('Ticket not found: %s', ticket_id)
            return
            
        # Create notification
        notification_data = {
            'ticket_id': ticket_id,
            'user_id': ticket['user_id'],
            'message': f'Ticket #{ticket_id} has been updated',
            'created_at': datetime.now().isoformat()
        }
        
        notification_result = supabase_client.table('notifications').insert(notification_data).execute()
        
        if notification_result.error:
            logger.error('Error creating notification: %s', notification_result.error)
            return
            
        logger.info('Successfully created notification for ticket update')
        
    except Exception as e:
        logger.error('Error in notify_ticket_updated: %s', str(e))
        return 

async def notify_ticket_created(supabase_client, ticket, user):
    try:
        # Get assigned agent details if any
        agent_name = None
        if ticket.get('assigned_to'):
            agent_result = supabase_client.table('profiles').select('full_name').eq('id', ticket['assigned_to']).single().execute()
            if agent_result.data:
                agent_name = agent_result.data.get('full_name')

        # Create notification for the ticket creator
        creator_notification = {
            'user_id': user['id'],
            'title': 'Ticket Created',
            'message': f'Your ticket #{ticket["id"]} has been created successfully' + 
                      (f' and assigned to {agent_name}' if agent_name else ''),
            'type': 'ticket_created',
            'ticket_id': ticket['id'],
            'created_at': datetime.now().isoformat()
        }
        creator_result = supabase_client.table('notifications').insert(creator_notification).execute()
        if not creator_result.data:
            logger.error('Failed to create notification for ticket creator')

        # If there's an assigned agent, create notification for them
        if ticket.get('assigned_to'):
            agent_notification = {
                'user_id': ticket['assigned_to'],
                'title': 'New Ticket Assigned',
                'message': f'Ticket #{ticket["id"]} has been assigned to you',
                'type': 'ticket_assigned',
                'ticket_id': ticket['id'],
                'created_at': datetime.now().isoformat()
            }
            agent_result = supabase_client.table('notifications').insert(agent_notification).execute()
            if not agent_result.data:
                logger.error('Failed to create notification for assigned agent')

        logger.info('Successfully created notifications for ticket creation')

    except Exception as e:
        logger.error('Error in notify_ticket_created: %s', str(e))
        return 