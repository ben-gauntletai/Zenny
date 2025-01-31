from fastapi import FastAPI, HTTPException, Header, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langsmith import Client
from supabase import create_client, Client as SupabaseClient
from typing import Optional, Dict, Any, List, Union
import os
from dotenv import load_dotenv
import json
from .utils.notifications import notify_ticket_updated, notify_ticket_created
from .utils.formatting import format_ticket_numbers
from datetime import datetime
import logging
import re
import tempfile
import openai
from openai import OpenAI
import numpy as np
from fastapi.responses import JSONResponse
from yarl import URL
from math import isnan
from fastapi import Depends
from pinecone import Pinecone
from uuid import UUID

corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
}

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

# Initialize Supabase client
try:
    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not supabase_key:
        raise ValueError("Supabase URL and key must be provided")
    
    supabase = create_client(supabase_url, supabase_key)
    logger.info("Supabase client initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize Supabase client: {str(e)}")
    raise

# Initialize Pinecone
pc = Pinecone(api_key=os.getenv('PINECONE_API_KEY'))
index = pc.Index(os.getenv('PINECONE_INDEX'))

app = FastAPI(
    title="AutoCRM API",
    description="API for handling CRM operations with AI assistance",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", 
        "https://main.d7534wkloee0c.amplifyapp.com",       # Local development
        "https://zenny-h9eu.onrender.com", # Render backend URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize LangSmith client if API key is available
langsmith_api_key = os.getenv('LANGCHAIN_API_KEY')
if langsmith_api_key:
    try:
        os.environ["LANGCHAIN_TRACING_V2"] = "true"
        os.environ["LANGCHAIN_PROJECT"] = os.getenv('LANGCHAIN_PROJECT', 'zenny')
        os.environ["LANGCHAIN_ENDPOINT"] = "https://api.smith.langchain.com"
        os.environ["LANGCHAIN_API_KEY"] = langsmith_api_key
        logger.info("LangSmith environment variables set successfully")
    except Exception as e:
        logger.error(f"Failed to initialize LangSmith: {str(e)}")

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title="AutoCRM API",
        version="1.0.0",
        description="API for handling CRM operations with AI assistance",
        routes=app.routes,
    )
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi

async def get_supabase_client() -> SupabaseClient:
    return supabase

async def get_current_user(authorization: str = Header(...), supabase_client: SupabaseClient = Depends(get_supabase_client)) -> Dict[str, Any]:
    try:
        # Extract the token from the Authorization header
        token = authorization.split(' ')[1] if authorization.startswith('Bearer ') else authorization
        
        # Get user data from Supabase
        user_response = supabase_client.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = user_response.user
        
        # Get user's role from profiles table
        profile_response = supabase_client.table('profiles').select('role').eq('id', user.id).single().execute()
        if not profile_response.data:
            raise HTTPException(status_code=401, detail="Could not fetch user profile")
        
        # Create a new dictionary with user data and role
        user_data = {
            'id': user.id,
            'email': user.email,
            'user_metadata': {
                'role': profile_response.data['role']
            }
        }
        
        return user_data
        
    except Exception as e:
        logger.error('Error getting current user: %s', str(e))
        raise HTTPException(status_code=401, detail="Invalid token")

@app.get("/health")
async def health_check():
    """
    Health check endpoint to verify the API is running.
    """
    try:
        # Simple connection test
        logger.info("Testing database connection...")
        result = supabase.table('profiles').select('count', count='exact').limit(1).execute()
        logger.info("Database connection test successful")
        return {
            "status": "healthy",
            "services": {
                "api": "up",
                "database": "up"
            },
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return {
            "status": "unhealthy",
            "services": {
                "api": "up",
                "database": "down",
                "error": str(e)
            },
            "timestamp": datetime.now().isoformat()
        }

@app.get("/warmup")
async def warmup_database():
    """
    Endpoint to warm up the database connection.
    Makes a lightweight query to ensure the connection is established.
    """
    try:
        logger.info("Warming up database connection...")
        # Make a simple count query
        result = supabase.table('profiles').select('count', count='exact').limit(1).execute()
        logger.info("Database warmup successful with result: %s", result)
        return {
            "status": "success",
            "message": "Database connection warmed up successfully",
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Database warmup failed: {str(e)}")
        return {
            "status": "error",
            "message": "Failed to warm up database connection",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

async def handle_crm_operations(result: str, user_id: str, supabase_client: SupabaseClient, display_content: str = '') -> str:
    try:
        # Get user info at the start
        user_info = supabase_client.table('profiles').select('*').eq('id', user_id).single().execute()
        if not user_info.data:
            raise ValueError('User not found')
        user = {
            'id': user_id,
            'user_metadata': user_info.data
        }
        
        # Split response into actions
        actions = [line.strip() for line in result.split('\n') if line.strip().startswith('ACTION:')]
        
        if not actions:
            return "I couldn't understand your request. Please try rephrasing it."
            
        responses = []
        for action_text in actions:
            action_match = action_text.split('ACTION: ', 1)[1].split(' ', 1)
            if len(action_match) != 2:
                continue
                
            action, details = action_match
            
            if action.upper() == 'SEARCH':
                # Parse field-based search criteria using the raw query content
                field_matches = re.finditer(r'(\w+):\s*([^\s]+(?:\s+[^\s]+)*?)(?=\s+\w+:|$)', details)
                search_criteria = {match.group(1): match.group(2) for match in field_matches}
                
                logger.info("Search criteria before processing: %s", search_criteria)
                
                # The email is already in the raw query from MentionInput, no need to parse display_content
                if 'assigned_to' in search_criteria:
                    assignee = search_criteria['assigned_to']
                    if assignee.lower() != 'unassigned':
                        # Remove any @ prefix if present as the email is stored without it
                        assignee_email = assignee.lstrip('@')
                        logger.info("Looking up agent with email: %s", assignee_email)
                        search_criteria['assigned_to'] = assignee_email
                
                # Get user role
                user_info = supabase_client.table('profiles').select('role').eq('id', user_id).single().execute()
                
                # Build query based on role
                base_query = supabase_client.table('tickets').select('''
                    *,
                    profiles!tickets_user_id_fkey (email, name),
                    agents:profiles!tickets_assigned_to_fkey (email, name)
                ''')
                
                if user_info.data['role'] == 'agent':
                    # For agents: show open tickets and assigned tickets, excluding Admin group
                    tickets = base_query.filter('status', 'eq', 'open') \
                        .filter('group_name', 'neq', 'Admin') \
                        .execute()
                    assigned_tickets = base_query.filter('assigned_to', 'eq', user_id) \
                        .filter('group_name', 'neq', 'Admin') \
                        .execute()
                    tickets.data.extend(assigned_tickets.data)
                elif user_info.data['role'] == 'admin':
                    # For admins: show all open tickets and assigned tickets
                    tickets = base_query.filter('status', 'eq', 'open').execute()
                    assigned_tickets = base_query.filter('assigned_to', 'eq', user_id).execute()
                    tickets.data.extend(assigned_tickets.data)
                else:
                    # For regular users: show only their tickets
                    tickets = base_query.filter('user_id', 'eq', user_id).execute()

                # Apply field-based filters
                filtered_tickets = tickets.data
                # Apply all filters at once to ensure tickets match ALL criteria
                filtered_tickets = [
                    ticket for ticket in filtered_tickets
                    if all(
                        (
                            # Special handling for assigned_to field
                            field == 'assigned_to' and (
                                (value.lower() == 'unassigned' and ticket['assigned_to'] is None) or
                                (value.lower() != 'unassigned' and 
                                 # Look up the user ID for the email
                                 (assignee_data := supabase_client.table('profiles')
                                  .select('id')
                                  .eq('email', value)
                                  .execute()).data and
                                 ticket.get('assigned_to') == assignee_data.data[0]['id']
                                )
                            )
                        ) if field == 'assigned_to' else (
                            # Handle all other fields
                            str(ticket.get(field, '')).lower() == value.lower()
                        )
                        for field, value in search_criteria.items()
                    )
                ]
                
                if filtered_tickets:
                    # Remove duplicates based on ticket ID and sort by ID
                    unique_tickets = sorted(
                        {t['id']: t for t in filtered_tickets}.values(),
                        key=lambda x: x['id']
                    )
                    # Format ticket display with more details
                    ticket_summaries = []
                    for t in unique_tickets:
                        status_str = f"({t['status']})"
                        priority_str = f"[{t['priority']}]" if 'priority' in t else ""
                        assigned_to = ""
                        if t.get('agents'):
                            assigned_to = f" - Assigned to @{t['agents']['name']}"
                        elif t.get('assigned_to') is None:
                            assigned_to = " - Unassigned"
                        ticket_summaries.append(f"#{t['id']}: {t['subject']} {status_str} {priority_str}{assigned_to}")
                    
                    ticket_summary = '\n'.join(ticket_summaries)
                    responses.append(f"I found these tickets:\n{ticket_summary}")
                else:
                    responses.append('No tickets found matching your search criteria.')
                    
            elif action.upper() == 'UPDATE':
                logger.info("Processing UPDATE action")
                # Updated regex to handle unassigned tickets and ranges
                ticket_match = re.search(r'ticket:\s*([\d,\s\-]+|unassigned)(?=\s|$)', details)
                priority_match = re.search(r'priority:\s*(\w+)(?=\s|$)', details)
                status_match = re.search(r'status:\s*(\w+)(?=\s|$)', details)
                group_match = re.search(r'group_name:\s*(\w+)(?=\s|$)', details)
                type_match = re.search(r'type:\s*(\w+)(?=\s|$)', details)
                # Updated pattern to handle topic values with spaces and special characters
                topic_match = re.search(r'topic:\s*"([^"]+)"(?=\s|$)', details)
                if not topic_match:
                    # Try without quotes for backward compatibility
                    topic_match = re.search(r'topic:\s*((?:[^"\s]+\s*)+?)(?=\s+\w+:|$)', details)
                # Updated pattern to handle email addresses without @ prefix
                assigned_to_match = re.search(r'assigned_to:\s*(unassigned|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?=\s|$)', details, re.IGNORECASE)
                
                logger.info("Regex matches: %s", {
                    'ticket_match': ticket_match.group(1) if ticket_match else None,
                    'priority_match': priority_match.group(1) if priority_match else None,
                    'status_match': status_match.group(1) if status_match else None,
                    'group_match': group_match.group(1) if group_match else None,
                    'type_match': type_match.group(1) if type_match else None,
                    'topic_match': topic_match.group(1) if topic_match else None,
                    'assigned_to_match': assigned_to_match.group(1) if assigned_to_match else None
                })

                if not ticket_match:
                    responses.append('Please specify which tickets to update.')
                    continue
                    
                updates = {}
                ticket_ids_str = ticket_match.group(1)
                
                # Parse updates
                if priority_match:
                    priority = priority_match.group(1).lower()
                    logger.info("Processing priority: %s", priority)
                    if priority in ['low', 'normal', 'high', 'urgent']:
                        updates['priority'] = priority
                    else:
                        responses.append('Invalid priority. Must be "low", "normal", "high", or "urgent" (case insensitive)')
                        continue
                        
                if status_match:
                    status = status_match.group(1).lower()
                    logger.info("Processing status: %s", status)
                    if status in ['open', 'pending', 'solved', 'closed']:
                        updates['status'] = status
                    else:
                        responses.append('Invalid status. Must be "open", "pending", "solved", or "closed" (case insensitive)')
                        continue
                        
                if group_match:
                    group = group_match.group(1)  # Preserve case
                    logger.info("Processing group: %s", group)
                    if group in ['Admin', 'Support']:
                        updates['group_name'] = group
                    else:
                        responses.append('Invalid group name. Must be exactly "Admin" or "Support"')
                        continue

                if type_match:
                    ticket_type = type_match.group(1).lower()
                    logger.info("Processing type: %s", ticket_type)
                    if ticket_type in ['question', 'incident', 'problem', 'task']:
                        updates['ticket_type'] = ticket_type
                    else:
                        responses.append('Invalid type. Must be "question", "incident", "problem", or "task" (case insensitive)')
                        continue

                if topic_match:
                    topic = topic_match.group(1)
                    logger.info("Processing topic: %s", topic)
                    valid_topics = [
                        "Order & Shipping Issues",
                        "Billing & Account Concerns",
                        "Communication & Customer Experience",
                        "Policy, Promotions & Loyalty Programs",
                        "Product & Service Usage"
                    ]
                    # Case-insensitive comparison
                    matching_topic = next((t for t in valid_topics if t.lower() == topic.lower()), None)
                    if matching_topic:
                        updates['topic'] = matching_topic  # Use the exact case from valid_topics
                    else:
                        topic_list = '", "'.join(valid_topics)
                        responses.append(f'Invalid topic. Must be one of: "{topic_list}"')
                        continue
                        
                if assigned_to_match:
                    assignee = assigned_to_match.group(1)
                    logger.info("Found assigned_to match: %s", assignee)
                    
                    if assignee.lower() == 'unassigned':
                        updates['assigned_to'] = None
                    else:
                        # Extract email from the raw content
                        # The MentionInput component sends the email in the format: assigned_to: john.doe@example.com
                        # Remove any @ prefix if present as the email is stored without it
                        assignee_email = assignee.lstrip('@')
                        logger.info("Looking up agent with email: %s", assignee_email)
                        
                        assignee_data = supabase_client.table('profiles').select('id,full_name,email').eq('email', assignee_email).execute()
                        logger.info("Assignee lookup result: %s", json.dumps(assignee_data.data if assignee_data.data else None, indent=2))
                        
                        if assignee_data.data:
                            updates['assigned_to'] = assignee_data.data[0]['id']
                            logger.info("Found agent %s (%s) with ID %s", 
                                assignee_data.data[0].get('full_name'),
                                assignee_data.data[0].get('email'),
                                assignee_data.data[0]['id'])
                        else:
                            logger.error("Could not find agent with email %s. Raw assignee value was: %s", assignee_email, assignee)
                            responses.append(f'Could not find agent with email {assignee_email}')
                            continue
                
                logger.info("Final updates object: %s", updates)
                
                # Process ticket IDs
                ticket_ids = []
                if ticket_ids_str.lower() == 'unassigned':
                    logger.info("Fetching unassigned tickets...")
                    unassigned_tickets = supabase_client.table('tickets').select('id').filter('assigned_to', 'is', 'null').execute()
                    logger.info("Unassigned tickets query result: %s", json.dumps(unassigned_tickets.data if unassigned_tickets.data else [], indent=2))
                    if unassigned_tickets.data:
                        ticket_ids = [t['id'] for t in unassigned_tickets.data]
                        logger.info("Processing the following unassigned ticket IDs: %s", ticket_ids)
                    else:
                        logger.info("No unassigned tickets found in the system")
                        responses.append('No unassigned tickets found')
                        continue
                else:
                    # Process normal ticket IDs or ranges
                    raw_ticket_ids = ticket_ids_str.split(',')
                    logger.info("Raw ticket segments: %s", raw_ticket_ids)
                    
                    for segment in raw_ticket_ids:
                        segment = segment.strip()
                        logger.info("Processing segment: %s", segment)
                        
                        # Check if it's a range (e.g., "43-47")
                        range_match = re.match(r'^(\d+)-(\d+)$', segment)
                        if range_match:
                            start, end = map(int, range_match.groups())
                            ticket_ids.extend(range(start, end + 1))
                        else:
                            try:
                                ticket_ids.append(int(segment))
                            except ValueError:
                                responses.append(f'Invalid ticket ID format: {segment}')
                                continue
                
                # Update tickets
                update_results = []
                for ticket_id in ticket_ids:
                    try:
                        # Get current ticket
                        current_ticket = supabase_client.table('tickets').select('*').eq('id', ticket_id).execute()
                        
                        if not current_ticket.data:
                            update_results.append({'id': ticket_id, 'success': False, 'error': 'Ticket not found'})
                            continue
                            
                        # Check permissions
                        user_info = supabase_client.table('profiles').select('role').eq('id', user_id).execute()
                        if user_info.data and user_info.data[0]['role'] == 'agent' and current_ticket.data[0]['group_name'] == 'Admin':
                            update_results.append({'id': ticket_id, 'success': False, 'error': 'Agents cannot modify Admin group tickets'})
                            continue
                        
                        # Store previous state
                        previous_ticket = current_ticket.data[0].copy()
                        
                        # Update ticket
                        updated_ticket = supabase_client.table('tickets').update(updates).eq('id', ticket_id).execute()
                        
                        if updated_ticket.data:
                            # Create notification
                            await notify_ticket_updated(supabase_client, updated_ticket.data[0], user, previous_ticket)
                            update_results.append({'id': ticket_id, 'success': True})
                        else:
                            update_results.append({'id': ticket_id, 'success': False, 'error': 'Update failed'})
                            
                    except Exception as e:
                        logger.error(f"Error updating ticket {ticket_id}: {str(e)}")
                        update_results.append({'id': ticket_id, 'success': False, 'error': str(e)})
                
                # Format response
                successful = [r['id'] for r in update_results if r['success']]
                failed = [(r['id'], r['error']) for r in update_results if not r['success']]
                
                response_parts = []
                if successful:
                    # Format field updates with special handling for assigned_to
                    formatted_updates = []
                    for key, value in updates.items():
                        if key == 'assigned_to':
                            if value is None:
                                formatted_updates.append('Assigned To set to Unassigned')
                            else:
                                # Get assignee info
                                assignee_data = supabase_client.table('profiles').select('full_name,email').eq('id', value).single().execute()
                                assignee = assignee_data.data if assignee_data.data else None
                                # Show name in UI but keep email as reference
                                if assignee:
                                    name = assignee.get('full_name') or 'Unknown user'
                                    formatted_updates.append(f'Assigned To set to @{name}')
                                else:
                                    formatted_updates.append('Assigned To set to Unknown user')
                        else:
                            # Capitalize first letter of value and format key
                            formatted_key = ' '.join(word.title() for word in key.split('_'))
                            formatted_value = str(value)[0].upper() + str(value)[1:] if value else value
                            formatted_updates.append(f'{formatted_key} set to {formatted_value}')
                    
                    fields_updated = ', '.join(formatted_updates)
                    # Use the format_ticket_numbers helper for successful tickets
                    ticket_nums = format_ticket_numbers(successful)
                    response_parts.append(f"Successfully updated tickets {ticket_nums} with: {fields_updated}")

                if failed:
                    # Group failed tickets by error message
                    error_groups = {}
                    for ticket_id, error in failed:
                        if error not in error_groups:
                            error_groups[error] = []
                        error_groups[error].append(ticket_id)
                    
                    # Format each error group with ticket ranges
                    failure_messages = []
                    for error, tickets in error_groups.items():
                        ticket_range = format_ticket_numbers(tickets)
                        failure_messages.append(f"{ticket_range} ({error})")
                    
                    response_parts.append(f"Failed to update tickets: {', '.join(failure_messages)}")
                
                responses.append('\n'.join(response_parts))
                
            elif action.upper() == 'CREATE':
                subject_match = details.split('subject:', 1)
                if len(subject_match) < 2:
                    responses.append('Please specify a subject for the ticket.')
                    continue
                    
                subject = subject_match[1].strip()
                new_ticket = supabase_client.table('tickets').insert({
                    'subject': subject,
                    'user_id': user_id,
                    'status': 'open',
                    'priority': 'normal',
                    'created_at': 'now()',
                    'updated_at': 'now()'
                }).execute()
                
                if new_ticket.data:
                    responses.append(f"Created new ticket #{new_ticket.data[0]['id']} with subject: {subject}")
                else:
                    responses.append('Failed to create ticket.')
                    
            elif action.upper() == 'INFO':
                customer_match = details.split('customer:', 1)
                customer_id = customer_match[1].strip() if len(customer_match) > 1 else user_id
                
                customer_info = supabase_client.table('profiles').select('*').eq('id', customer_id).single().execute()
                
                if customer_info.data:
                    responses.append(f"Customer Information:\nName: {customer_info.data['name']}\nEmail: {customer_info.data['email']}")
                else:
                    responses.append('Customer not found.')
        
        return '\n'.join(responses) if responses else "I couldn't process your request. Please try again."
        
    except Exception as e:
        print(f"Error in handle_crm_operations: {str(e)}")
        return "I encountered an error while processing your request. Please try again."

@app.post("/autocrm")
async def handle_autocrm(
    request: Dict[str, Any],
    authorization: str = Header(None)
):
    logger.info("Received AutoCRM request")
    
    if not authorization:
        logger.error("No authorization header provided")
        raise HTTPException(status_code=401, detail="No authorization header")

    try:
        # Debug logging for auth token
        logger.info(f"Processing auth token: {authorization[:20]}...")
        
        # Get user from auth token
        logger.info("Attempting to get user from auth token")
        user_response = supabase.auth.get_user(authorization.replace('Bearer ', ''))
        logger.info(f"User response received: {user_response}")
        user = user_response.user

        if not user:
            logger.error("Invalid token - no user found")
            raise HTTPException(status_code=401, detail="Invalid token")

        # Check if user is agent or admin
        user_role = user.user_metadata.get('role')
        logger.info(f"User role: {user_role}")
        is_agent_or_admin = user_role in ['agent', 'admin']
        if not is_agent_or_admin:
            logger.error(f"Unauthorized access attempt by user with role: {user_role}")
            raise HTTPException(
                status_code=403,
                detail="Unauthorized. Only agents and admins can use AutoCRM."
            )

        # Get OpenAI key
        openai_api_key = os.getenv('OPENAI_API_KEY')
        if not openai_api_key:
            logger.error("OpenAI API key not configured")
            raise HTTPException(
                status_code=500,
                detail="OpenAI API key not configured. Please contact support."
            )

        # Get request data
        query = request.get('query')  # This is the raw text content
        display_content = request.get('displayContent')  # This is the HTML content with mentions
        user_id = request.get('userId')
        
        # Add detailed logging of the request data
        logger.info("Raw request data: %s", json.dumps(request, indent=2))
        logger.info("Query (raw content): %s", query)
        logger.info("Display content (HTML): %s", display_content)
        logger.info("User ID: %s", user_id)

        # Process mentions in display content to ensure we always use emails
        if display_content:
            # Find all mentions in the display content
            mention_matches = re.finditer(r'<span[^>]*?data-email=[\'"]([^\'"]+)[\'"][^>]*>@([^<]+)</span>', display_content)
            for match in mention_matches:
                email = match.group(1)
                display_name = match.group(2)
                # Replace any occurrence of the display name with the email
                # This ensures the LLM always sees the email
                query = query.replace(f"@{display_name}", email)
                logger.info(f"Replaced mention @{display_name} with email {email}")

        logger.info("Final query being sent to LLM: %s", query)
        logger.info("=" * 50)

        if not query or not user_id:
            logger.error("Missing required fields in request")
            raise HTTPException(status_code=400, detail="Query and userId are required")

        # Get or create conversation and store user message
        try:
            # Get or create conversation
            conversation = supabase.table('autocrm_conversations').select('id').eq('user_id', user_id).order('updated_at.desc').limit(1).execute()
            
            conversation_id = None
            if conversation.data:
                conversation_id = conversation.data[0]['id']
                logger.info("Found existing conversation for user message: %s", conversation_id)
            else:
                # Create new conversation
                new_conv = supabase.table('autocrm_conversations').insert({
                    'user_id': user_id,
                    'created_at': datetime.now().isoformat(),
                    'updated_at': datetime.now().isoformat()
                }).execute()
                if new_conv.data:
                    conversation_id = new_conv.data[0]['id']
                    logger.info("Created new conversation for user message: %s", conversation_id)

            if conversation_id:
                # Store the user message
                user_message_data = {
                    'conversation_id': conversation_id,
                    'sender': 'user',
                    'content': query,
                    'display_content': display_content or query,
                    'created_at': datetime.now().isoformat()
                }
                logger.info("Storing user message: %s", json.dumps(user_message_data, indent=2))
                user_message_result = supabase.table('autocrm_messages').insert(user_message_data).execute()
                logger.info("User message store result: %s", json.dumps(user_message_result.data if user_message_result.data else [], indent=2))

                # Update conversation timestamp
                update_result = supabase.table('autocrm_conversations').update({
                    'updated_at': datetime.now().isoformat()
                }).eq('id', conversation_id).execute()
                logger.info("Update result: %s", json.dumps(update_result.data if update_result.data else [], indent=2))

        except Exception as e:
            logger.error(f"Error storing user message: {str(e)}")
            logger.error("Stack trace:", exc_info=True)
            # Continue even if storing fails
            pass

        # Initialize LangChain components
        logger.info("Initializing LangChain components")
        system_prompt = """You are an AI assistant helping with CRM tasks. You must respond in a structured format that starts with an ACTION: followed by the action type and any relevant details.

    Available actions:
    1. ACTION: SEARCH - For finding tickets

        When user asks to find all tickets where one field is a certain value : "ACTION: SEARCH field: value"
        When user asks to find all tickets where two fields are a certain value : "ACTION: SEARCH field1: value1 field2: value2"

    2. ACTION: UPDATE - For updating tickets. IMPORTANT: When updating multiple tickets, you MUST use a single UPDATE action.

        Please follow this format for updating multiple tickets (we could add more fields than this):

        When user asks to update only one field: "ACTION: UPDATE ticket: field: value"
        When user asks to update two fields: "ACTION: UPDATE ticket: 43-47 field1: value1 field2: value2"
        Mixed format updating one field: "ACTION: UPDATE ticket: 43-45,47,49-51 field1: value1"
        When user asks to update unassigned tickets: "ACTION: UPDATE ticket: unassigned field1: value1"
        When user asks to update unassigned tickets to a user (email): "ACTION: UPDATE ticket: 43,46 assigned_to: email_here"

        IMPORTANT: DO NOT ADD FIELDS THAT THE USER DIDN'T REQUEST. YOU MUST REPLACE THE FIELD AND VALUE.

        Here are the fields along with their values:
        status: open; pending; solved; closed
        priority: low; normal; high; urgent
        ticket_type: question; incident; problem; task
        group_name: Admin; Support
        assigned_to: email (e.g., assigned_to: john.doe@example.com)
        assigned_to: unassigned (to remove assignment)
        topic: Order & Shipping Issues; Billing & Account Concerns; Communication & Customer Experience; Policy, Promotions & Loyalty Programs; Product & Service Usage
    
        If a user mentions topic as well as something that might sound like one of these topics even if it isn't the exact value, please use these values.
        If a user mentions type, please assume it's ticket_type.

        IMPORTANT: If the user specifies to update unassigned tickets, please just use "assigned_to: unassigned". Do not assume they want to update certain tickets.

        Please use these to plug into the format given the user's request. Please understand the user's intent and conform with the template.

    Keep responses concise and professional. Always start with ACTION: followed by the type.
    
    CRITICAL INSTRUCTIONS FOR UPDATES:
    1. ONLY include fields the user explicitly asks to update
    2. ALWAYS use a single UPDATE action for multiple tickets
    3. For consecutive numbers, use ranges (e.g., 43-47)
    4. For unassigned tickets, use "assigned_to: unassigned"
    5. NEVER split updates into multiple actions
    6. NEVER add fields that weren't requested
    7. For assigning tickets, use the exact email format without @ prefix (e.g., assigned_to: john.doe@example.com)"""

        human_prompt = """Previous conversation:
{history}

Current request:
{input}"""

        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", human_prompt),
        ])

        # Get conversation history
        history = []
        try:
            # Get the most recent conversation
            logger.info("Fetching most recent conversation for user_id: %s", user_id)
            conversation = supabase.table('autocrm_conversations').select('id').eq('user_id', user_id).order('updated_at.desc').limit(1).execute()
            logger.info("Conversation query result: %s", json.dumps(conversation.data if conversation.data else [], indent=2))
            
            if conversation.data:
                conversation_id = conversation.data[0]['id']
                logger.info("Found conversation ID: %s", conversation_id)
                # Get only the last system message from this conversation
                logger.info("Fetching last system message from conversation")
                messages = supabase.table('autocrm_messages').select('sender,content').eq('conversation_id', conversation_id).eq('sender', 'system').order('created_at.desc').limit(1).execute()
                logger.info("Messages query result: %s", json.dumps(messages.data if messages.data else [], indent=2))
                
                if messages.data:
                    history = [f"{msg['sender']}: {msg['content']}" for msg in messages.data]
                    logger.info("Constructed history: %s", history)
                else:
                    logger.info("No system messages found in conversation")
            else:
                logger.info("No conversation found for user")
        except Exception as e:
            logger.error(f"Error fetching conversation history: {str(e)}")
            logger.error("Stack trace:", exc_info=True)
            # Continue without history if there's an error
            pass

        logger.info("Final history to be used in prompt: %s", history)

        # Initialize model with tracing enabled
        model = ChatOpenAI(
            openai_api_key=openai_api_key,
            model_name='gpt-4o-mini',
            temperature=0.7,
            tags=["autocrm"],
            metadata={
                "user_id": user_id,
                "user_role": user_role
            }
        )

        # Create chain with tracing
        chain = prompt.pipe(model).pipe(StrOutputParser())

        # Log the full prompt being sent to the LLM
        prompt_input = {
            'input': query,  # Current query
            'history': '\n'.join(history) if history else 'No previous conversation'  # Add conversation history
        }
        logger.info("Prompt input parameters: %s", json.dumps(prompt_input, indent=2))
        formatted_prompt = prompt.format_messages(**prompt_input)
        logger.info("Full prompt being sent to LLM:")
        for message in formatted_prompt:
            logger.info("Role: %s", message.type)
            logger.info("Content:\n%s", message.content)
            logger.info("-" * 50)  # Add separator between messages

        # Run the chain
        result = await chain.ainvoke(prompt_input)

        # Log the raw LLM response with clear separator for visibility
        logger.info("=" * 50)
        logger.info("Raw LLM response (ACTION):\n%s", result)
        logger.info("=" * 50)

        # Process the result
        response = await handle_crm_operations(result, user_id, supabase)

        # Store AI response
        try:
            # Get or create conversation
            conversation = supabase.table('autocrm_conversations').select('id').eq('user_id', user_id).order('updated_at.desc').limit(1).execute()
            
            conversation_id = None
            if conversation.data:
                conversation_id = conversation.data[0]['id']
                logger.info("Found existing conversation: %s", conversation_id)
            else:
                # Create new conversation
                new_conv = supabase.table('autocrm_conversations').insert({
                    'user_id': user_id,
                    'created_at': datetime.now().isoformat(),
                    'updated_at': datetime.now().isoformat()
                }).execute()
                if new_conv.data:
                    conversation_id = new_conv.data[0]['id']
                    logger.info("Created new conversation: %s", conversation_id)

            if conversation_id:
                # Store the system response
                message_data = {
                    'conversation_id': conversation_id,
                    'sender': 'system',
                    'content': response,
                    'display_content': response,
                    'created_at': datetime.now().isoformat()
                }
                logger.info("Storing system message: %s", json.dumps(message_data, indent=2))
                message_result = supabase.table('autocrm_messages').insert(message_data).execute()
                logger.info("Store result: %s", json.dumps(message_result.data if message_result.data else [], indent=2))

                # Update conversation timestamp
                update_result = supabase.table('autocrm_conversations').update({
                    'updated_at': datetime.now().isoformat()
                }).eq('id', conversation_id).execute()
                logger.info("Update result: %s", json.dumps(update_result.data if update_result.data else [], indent=2))

        except Exception as e:
            logger.error(f"Error storing conversation: {str(e)}")
            logger.error("Stack trace:", exc_info=True)
            # Continue even if storing fails
            pass

        # Log the processed response
        logger.info("Processed CRM response: \n%s", response)

        return {"reply": response}

    except Exception as e:
        logger.error(f"Error in handle_autocrm: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/autocrm/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    authorization: str = Header(None)
):
    """
    Endpoint to transcribe audio using OpenAI Whisper and process it through AutoCRM.
    """
    logger.info("Received audio transcription request")
    
    if not authorization:
        logger.error("No authorization header provided")
        raise HTTPException(status_code=401, detail="No authorization header")

    try:
        # Get user from auth token
        logger.info("Attempting to get user from auth token")
        user_response = supabase.auth.get_user(authorization.replace('Bearer ', ''))
        logger.info(f"User response received: {user_response}")
        user = user_response.user

        if not user:
            logger.error("Invalid token - no user found")
            raise HTTPException(status_code=401, detail="Invalid token")

        # Check if user is agent or admin
        user_role = user.user_metadata.get('role')
        logger.info(f"User role: {user_role}")
        is_agent_or_admin = user_role in ['agent', 'admin']
        if not is_agent_or_admin:
            logger.error(f"Unauthorized access attempt by user with role: {user_role}")
            raise HTTPException(
                status_code=403,
                detail="Unauthorized. Only agents and admins can use AutoCRM."
            )

        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_file.flush()
            
            try:
                # Initialize OpenAI client
                client = openai.OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
                
                # Transcribe audio using OpenAI Whisper
                logger.info("Transcribing audio with Whisper")
                with open(temp_file.name, 'rb') as audio_file:
                    transcript = client.audio.transcriptions.create(
                        file=audio_file,
                        model="whisper-1"
                    )
                logger.info("Transcription successful")
                
                # Process transcribed text through AutoCRM
                autocrm_request = {
                    'query': transcript.text,
                    'userId': user.id
                }
                
                logger.info(f"Processing transcribed text through AutoCRM: {transcript.text}")
                
                # Process through existing AutoCRM logic
                response = await handle_autocrm(autocrm_request, authorization)
                
                return {
                    "transcription": transcript.text,
                    "reply": response["reply"]
                }
                
            finally:
                # Clean up temporary file
                os.unlink(temp_file.name)
                
    except Exception as e:
        logger.error(f"Error in transcribe_audio: {str(e)}")
        logger.error("Stack trace:", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

async def get_relevant_articles(ticket_context, recent_messages, supabase_client):
    try:
        # Combine ticket context and recent messages into a query
        query_text = ""
        if ticket_context:
            query_text += f"{ticket_context.get('subject', '')} {ticket_context.get('description', '')} "
            logger.info(f"Added ticket context to query - Subject: {ticket_context.get('subject', '')}")
        
        for msg in recent_messages:
            query_text += f"{msg.get('content', '')} "
        
        logger.info("Combined query text for article search: %s", query_text[:200] + "..." if len(query_text) > 200 else query_text)

        # Get embeddings using LangChain
        embeddings = OpenAIEmbeddings(model="text-embedding-3-large")
        query_embedding = await embeddings.aembed_query(query_text.strip())
        logger.info("Generated embeddings for article search")

        # Query Pinecone for similar articles
        query_response = index.query(
            vector=query_embedding,
            top_k=5,
            include_metadata=True,
            filter={
                "type": "article"  # Only get articles
            }
        )
        logger.info("Pinecone query completed. Found %d matches", len(query_response['matches']))

        # Get the articles from Supabase using the IDs from Pinecone
        article_ids = []
        for match in query_response['matches']:
            if 'article_id' in match['metadata']:
                article_ids.append(match['metadata']['article_id'])
                logger.info("Found matching article ID: %s with score: %f", 
                          match['metadata'].get('article_id'), 
                          match['score'])

        if not article_ids:
            logger.info("No article IDs found in Pinecone matches")
            return []

        try:
            articles_result = supabase_client.table('knowledge_base_articles').select('*').in_('id', article_ids).execute()
            if articles_result.data:
                logger.info("Retrieved %d articles from Supabase", len(articles_result.data))
                for article in articles_result.data:
                    logger.info("Retrieved article - Title: %s", article.get('title', ''))
            else:
                logger.info("No articles found in Supabase for the given IDs")
            return articles_result.data if hasattr(articles_result, 'data') else []
        except Exception as e:
            logger.error('Error fetching knowledge base articles from Supabase: %s', str(e))
            return []

    except Exception as e:
        logger.error('Error in get_relevant_articles: %s', str(e))
        return []

async def find_similar_messages(content: str, ticket_id: int, supabase_client: SupabaseClient, limit: int = 5) -> List[Dict]:
    try:
        # Get embeddings using LangChain
        embeddings = OpenAIEmbeddings(model="text-embedding-3-large")
        query_embedding = await embeddings.aembed_query(content.strip())

        # Query Pinecone for similar messages
        query_response = index.query(
            vector=query_embedding,
            top_k=limit,
            include_metadata=True,
            filter={
                "type": "message",
                "ticket_id": str(ticket_id)  # Filter by ticket_id
            }
        )

        # Get all messages for this ticket from Supabase
        messages_result = supabase_client.table('replies').select('''
            *,
            user_profile:profiles!replies_user_id_fkey (
                email,
                full_name,
                avatar_url,
                role
            )
        ''').eq('ticket_id', ticket_id).order('created_at', desc=True).execute()

        if not messages_result.data:
            return []

        return messages_result.data

    except Exception as e:
        logger.error('Error in find_similar_messages: %s', str(e))
        return []

async def generate_message_embedding(content: str, ticket_id: str = None) -> List[float]:
    try:
        embeddings = OpenAIEmbeddings(model="text-embedding-3-large")
        embedding_vector = await embeddings.aembed_query(content.strip())
        return embedding_vector
    except Exception as e:
        logger.error('Error generating message embedding: %s', str(e))
        return None

@app.post("/api/tickets/{ticket_id}/replies/{reply_id}/process", response_model=Dict[str, Any])
async def process_reply(
    ticket_id: int,
    reply_id: Union[UUID, str],
    supabase_client: SupabaseClient = Depends(get_supabase_client),
    user: Dict[str, Any] = Depends(get_current_user)
):
    try:
        # Get the ticket context
        ticket_result = supabase_client.table('tickets').select('*').eq('id', ticket_id).execute()
        if not hasattr(ticket_result, 'data') or not ticket_result.data:
            raise HTTPException(status_code=404, detail="Ticket not found")
        ticket = ticket_result.data[0]

        # Get the reply that was just created
        reply_result = supabase_client.table('replies').select('*').eq('id', str(reply_id)).execute()
        if not hasattr(reply_result, 'data') or not reply_result.data:
            raise HTTPException(status_code=404, detail="Reply not found")
        reply = reply_result.data[0]

        # Get recent messages for context
        recent_result = supabase_client.table('replies').select('*').eq('ticket_id', ticket_id).order('created_at', desc=True).limit(10).execute()
        recent_messages = recent_result.data if hasattr(recent_result, 'data') else []

        # Only generate AI response if the message is from a user and not AI-generated
        if user['user_metadata']['role'] == 'user' and not reply.get('is_ai_generated'):
            try:
                # Generate enhanced AI response using all context
                ai_response = await generate_enhanced_response(
                    {
                        'ticket_context': ticket,
                        'recent_messages': recent_messages,
                        'relevant_articles': [],  # We can add this back if needed
                        'similar_messages': recent_messages
                    },
                    reply['content'],
                    'user'
                )

                if ai_response:
                    # Get the assigned agent's ID from the ticket or find an available agent
                    assigned_agent_id = ticket.get('assigned_to')
                    
                    if not assigned_agent_id:
                        # Find an available agent
                        agent_result = supabase_client.table('profiles').select('id').eq('role', 'agent').limit(1).execute()
                        if hasattr(agent_result, 'data') and agent_result.data:
                            assigned_agent_id = agent_result.data[0]['id']
                            # Update ticket with assigned agent
                            supabase_client.table('tickets').update({'assigned_to': assigned_agent_id}).eq('id', ticket_id).execute()
                        else:
                            assigned_agent_id = "00000000-0000-0000-0000-000000000000"  # System user ID

                    # Create the AI reply
                    ai_reply_result = supabase_client.table('replies').insert({
                        'ticket_id': ticket_id,
                        'content': ai_response,
                        'user_id': assigned_agent_id,
                        'is_public': True,
                        'is_ai_generated': True
                    }).execute()

                    if hasattr(ai_reply_result, 'data'):
                        return {"success": True, "ai_reply": ai_reply_result.data[0]}

            except Exception as e:
                logger.error('Error generating AI response: %s', str(e))
                # Don't raise an exception here, just log it
                return {"success": False, "error": str(e)}

        return {"success": True}

    except Exception as e:
        logger.error('Error in process_reply: %s', str(e))
        raise HTTPException(status_code=400, detail=str(e))

# Update the existing endpoint to just return the reply data
@app.post("/api/tickets/{ticket_id}/replies", response_model=Dict[str, Any])
async def create_reply(
    ticket_id: int,
    data: Dict[str, Any],
    supabase_client: SupabaseClient = Depends(get_supabase_client),
    user: Dict[str, Any] = Depends(get_current_user)
):
    try:
        content = data.get('content')
        is_public = data.get('is_public', True)
        
        if not content:
            raise HTTPException(status_code=400, detail="Content is required")

        # Create the reply
        reply_result = supabase_client.table('replies').insert({
            'ticket_id': ticket_id,
            'content': content,
            'user_id': user['id'],
            'is_public': is_public,
            'is_ai_generated': False
        }).execute()

        if not hasattr(reply_result, 'data'):
            raise HTTPException(status_code=400, detail="Failed to create reply")

        return {"reply": reply_result.data[0]}

    except Exception as e:
        logger.error('Error in create_reply: %s', str(e))
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/knowledge-base/generate-embeddings", response_model=Dict[str, Any])
async def generate_embeddings(
    request: Dict[str, Any],
    supabase_client: SupabaseClient = Depends(get_supabase_client)
):
    try:
        # Get article_id from request body
        article_id = request.get('article_id')
        
        # Get articles to process
        if article_id:
            # Get single article
            articles_query = supabase_client.table('knowledge_base_articles').select('id, title, content').eq('id', article_id)
        else:
            # Get all articles without embeddings
            articles_query = supabase_client.table('knowledge_base_articles').select('id, title, content').eq('has_embedding', False)
        
        articles_response = articles_query.execute()
        articles = articles_response.data if hasattr(articles_response, 'data') else []
        
        if not articles:
            return {"message": "No articles found to process", "updated_count": 0}

        # Initialize OpenAI embeddings
        embeddings = OpenAIEmbeddings(model="text-embedding-3-large")
        updated_count = 0

        # Process each article
        for article in articles:
            try:
                # Combine title and content for embedding
                text_to_embed = f"Title: {article['title']}\nContent: {article['content']}"
                embedding_vector = await embeddings.aembed_query(text_to_embed.strip())

                # Store in Pinecone
                index.upsert(
                    vectors=[{
                        'id': f"article_{article['id']}",
                        'values': embedding_vector,
                        'metadata': {
                            'title': article['title'],
                            'content': article['content'],
                            'article_id': article['id'],
                            'type': 'article'
                        }
                    }]
                )

                # Update has_embedding flag in Supabase
                update_result = supabase_client.table('knowledge_base_articles').update({
                    'has_embedding': True
                }).eq('id', article['id']).execute()

                if not update_result.data:
                    logger.error('Error updating has_embedding flag for article %s: No data returned', article['id'])
                    continue

                updated_count += 1
                logger.info('Successfully updated embedding for article %s', article['id'])

            except Exception as e:
                logger.error('Error processing article %s: %s', article['id'], str(e))
                continue

        return {
            "message": f"Successfully updated {updated_count} articles with embeddings",
            "updated_count": updated_count
        }

    except Exception as e:
        logger.error('Error generating embeddings: %s', str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/knowledge-base/search", response_model=Dict[str, Any])
async def search_similar_articles(
    request: Dict[str, str],
    supabase_client: SupabaseClient = Depends(get_supabase_client),
    user: Dict[str, Any] = Depends(get_current_user)
):
    try:
        query = request.get('query')
        if not query:
            raise HTTPException(status_code=400, detail="Query is required")

        # Generate embedding for the query
        embeddings = OpenAIEmbeddings(model="text-embedding-3-large")
        query_embedding = await embeddings.aembed_query(query.strip())

        # Search Pinecone for similar articles
        search_response = index.query(
            vector=query_embedding,
            top_k=5,
            include_metadata=True,
            filter={
                "type": "article"
            }
        )

        # Get article IDs from search results
        article_ids = [
            match['metadata']['article_id'] 
            for match in search_response['matches']
            if 'article_id' in match['metadata']
        ]

        if not article_ids:
            return {"articles": []}

        # Fetch full article data from Supabase
        articles_result = supabase_client.table('knowledge_base_articles').select('*').in_('id', article_ids).execute()
        
        if articles_result.error:
            logger.error('Error fetching articles: %s', articles_result.error)
            raise HTTPException(status_code=500, detail="Failed to fetch articles")

        return {"articles": articles_result.data or []}

    except Exception as e:
        logger.error('Error in search_similar_articles: %s', str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/embeddings/backfill", response_model=Dict[str, Any])
async def backfill_embeddings(
    supabase_client: SupabaseClient = Depends(get_supabase_client),
    user: Dict[str, Any] = Depends(get_current_user)
):
    try:
        # Get user's role from profiles table
        profile_response = supabase_client.table('profiles').select('role').eq('id', user['id']).single().execute()
        if not profile_response.data or profile_response.data['role'] != 'admin':
            raise HTTPException(status_code=403, detail="Only admins can perform embedding backfill")

        total_processed = 0
        embeddings = OpenAIEmbeddings(model="text-embedding-3-large")

        # Process knowledge base articles
        articles_result = supabase_client.table('knowledge_base_articles').select('id,title,content').execute()
        if articles_result.data:
            for article in articles_result.data:
                try:
                    # Generate embedding
                    text_to_embed = f"Title: {article['title']}\nContent: {article['content']}"
                    embedding_vector = await embeddings.aembed_query(text_to_embed.strip())

                    # Store in Pinecone
                    index.upsert(
                        vectors=[{
                            'id': f"article_{article['id']}",
                            'values': embedding_vector,
                            'metadata': {
                                'title': article['title'],
                                'content': article['content'],
                                'article_id': article['id'],
                                'type': 'article'
                            }
                        }]
                    )

                    # Update has_embedding flag in Supabase
                    update_result = supabase_client.table('knowledge_base_articles').update({
                        'has_embedding': True
                    }).eq('id', article['id']).execute()

                    if update_result.error:
                        logger.error('Error updating has_embedding flag for article %s: %s', article['id'], update_result.error)
                        continue

                    total_processed += 1
                    logger.info(f"Processed article {article['id']}")
                except Exception as e:
                    logger.error(f"Error processing article {article['id']}: {str(e)}")
                    continue

        return {
            "message": f"Successfully processed {total_processed} items",
            "total_processed": total_processed
        }

    except Exception as e:
        logger.error(f"Error in backfill_embeddings: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/knowledge-base/articles/{article_id}", response_model=Dict[str, Any])
async def delete_article(
    article_id: str,
    supabase_client: SupabaseClient = Depends(get_supabase_client),
    user: Dict[str, Any] = Depends(get_current_user)
):
    try:
        # Check if user is admin
        profile_response = supabase_client.table('profiles').select('role').eq('id', user['id']).single().execute()
        if not profile_response.data or profile_response.data['role'] != 'admin':
            raise HTTPException(status_code=403, detail="Only admins can delete articles")

        # Delete from Pinecone first
        try:
            index.delete(ids=[f"article_{article_id}"])
            logger.info(f"Successfully deleted embedding for article {article_id} from Pinecone")
        except Exception as e:
            logger.error(f"Error deleting embedding from Pinecone for article {article_id}: {str(e)}")
            # Continue with Supabase deletion even if Pinecone deletion fails

        # Delete from Supabase
        try:
            delete_result = supabase_client.table('knowledge_base_articles').delete().eq('id', article_id).execute()
            
            # Check if any rows were deleted
            if not delete_result.data:
                raise HTTPException(status_code=404, detail="Article not found")
                
            logger.info(f"Successfully deleted article {article_id} from Supabase")
            
            return {
                "message": f"Successfully deleted article {article_id} and its embedding",
                "article_id": article_id
            }
        except Exception as e:
            logger.error(f"Error deleting article from Supabase: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to delete article")

    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error in delete_article: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/favicon.ico")
async def favicon():
    """
    Handle favicon.ico requests gracefully
    """
    return {"status": "ok"}

async def get_conversation_context(ticket_id: int, current_message: str, supabase_client: SupabaseClient):
    try:
        # Get ticket context
        ticket_result = supabase_client.table('tickets').select('*').eq('id', ticket_id).single().execute()
        ticket_context = ticket_result.data if ticket_result.data else None

        # Get recent messages (last 5)
        messages_result = supabase_client.table('replies').select('*').eq('ticket_id', ticket_id).order('created_at', desc=True).limit(5).execute()
        recent_messages = messages_result.data if messages_result.data else []

        # Get relevant articles based on current context
        relevant_articles = await get_relevant_articles(ticket_context, recent_messages, supabase_client)

        # Find similar past messages
        similar_messages = await find_similar_messages(current_message, ticket_id, supabase_client)

        return {
            'ticket_context': ticket_context,
            'recent_messages': recent_messages,
            'relevant_articles': relevant_articles,
            'similar_messages': similar_messages
        }
    except Exception as e:
        logger.error(f"Error getting conversation context: {str(e)}")
        return None

async def generate_enhanced_response(context: Dict, current_message: str, user_role: str):
    try:
        # Format all context pieces
        system_content = """You are a helpful customer service AI assistant. Your goal is to provide clear, concise to customer inquiries.
        
        When responding to tickets:
        1. Lean only on the knowledge base articles as your source of information
        2. If similar past conversations are available, use them to inform your response
        3. Keep responses focused and actionable
        4. For initial ticket responses, acknowledge the issue, but do not lean on your own knowledge
        """
        
        if context['ticket_context']:
            system_content += f"\nTicket Context:\nTitle: {context['ticket_context'].get('subject', '')}\nDescription: {context['ticket_context'].get('description', '')}"
        
        if context['relevant_articles']:
            system_content += "\n\nRelevant Knowledge Base Articles:"
            for article in context['relevant_articles']:
                system_content += f"\n- {article.get('title', '')}: {article.get('content', '')}"
                logger.info(f"Adding article to context - Title: {article.get('title', '')}")
        else:
            logger.info("No relevant articles found for context")

        if context['similar_messages']:
            system_content += "\n\nSimilar Past Conversations:"
            for msg in context['similar_messages']:
                if msg.get('is_ai_generated'):
                    system_content += f"\n- AI: {msg.get('content', '')}"
                else:
                    system_content += f"\n- Customer: {msg.get('content', '')}"

        # Log the system content
        logger.info("=" * 50)
        logger.info("System Content:")
        logger.info(system_content)
        logger.info("=" * 50)
        
        messages = [
            SystemMessage(content=system_content),
            *[HumanMessage(content=msg['content']) if not msg.get('is_ai_generated') else AIMessage(content=msg['content']) 
              for msg in reversed(context['recent_messages'])],
            HumanMessage(content=current_message)
        ]

        # Log all messages being sent to the LLM
        logger.info("Messages being sent to LLM:")
        for msg in messages:
            logger.info("-" * 30)
            logger.info(f"Role: {msg.__class__.__name__}")
            logger.info(f"Content: {msg.content}")
        logger.info("=" * 50)

        chat = ChatOpenAI(
            temperature=0.7,
            model_name="gpt-4o-mini",
            max_tokens=500
        )

        prompt = ChatPromptTemplate.from_messages(messages)
        chain = prompt | chat | StrOutputParser()
        
        response = await chain.ainvoke({})
        
        # Log the LLM's response
        logger.info("LLM Response:")
        logger.info(response)
        logger.info("=" * 50)
        
        return response

    except Exception as e:
        logger.error('Error generating enhanced response: %s', str(e))
        return None

@app.post("/api/tickets", response_model=Dict[str, Any])
async def create_ticket(
    data: Dict[str, Any],
    supabase_client: SupabaseClient = Depends(get_supabase_client),
    user: Dict[str, Any] = Depends(get_current_user)
):
    try:
        # Validate required fields
        required_fields = ['subject', 'description', 'priority', 'ticket_type', 'topic']
        for field in required_fields:
            if field not in data:
                raise ValueError(f'Missing required field: {field}')

        # Find an available agent with matching specialty
        agents_result = supabase_client.table('profiles').select('id, email, full_name, specialty').eq('role', 'agent').eq('specialty', data['topic']).execute()
        agent = agents_result.data[0] if agents_result.data else None

        # Create the ticket
        ticket_data = {
            'subject': data['subject'],
            'description': data['description'],
            'priority': data['priority'],
            'ticket_type': data['ticket_type'],
            'topic': data['topic'],
            'user_id': user['id'],
            'status': 'open',
            'group_name': 'Support',
            'assigned_to': agent['id'] if agent else None
        }

        # Insert the ticket
        ticket_result = supabase_client.table('tickets').insert(ticket_data).execute()
        if not ticket_result.data:
            raise ValueError('Failed to create ticket')

        # Get the created ticket with related data
        created_ticket_result = supabase_client.table('tickets').select('''
            *,
            profiles!tickets_user_id_fkey (email, full_name),
            agents:profiles!tickets_assigned_to_fkey (email, full_name)
        ''').eq('id', ticket_result.data[0]['id']).single().execute()

        if not created_ticket_result.data:
            raise ValueError('Failed to fetch created ticket')

        ticket = created_ticket_result.data

        # Create initial reply with ticket description
        reply_data = {
            'ticket_id': ticket['id'],
            'content': data['description'],
            'user_id': user['id'],
            'is_public': True
        }

        reply_result = supabase_client.table('replies').insert(reply_data).execute()
        if not reply_result.data:
            logger.error('Error creating initial reply')

        # Get conversation context for AI response
        conversation_context = await get_conversation_context(ticket['id'], data['description'], supabase_client)

        # Generate AI response
        ai_response = None
        if conversation_context:
            try:
                ai_response = await generate_enhanced_response(
                    conversation_context,
                    data['description'],
                    'user'  # Initial ticket is always from a user
                )

                if ai_response:
                    # Get the assigned agent's ID from the ticket
                    assigned_agent_id = ticket.get('assigned_to')
                    if not assigned_agent_id:
                        logger.error('No assigned agent found for ticket %s', ticket['id'])
                        return {
                            'message': 'Reply created successfully',
                            'reply': {
                                **reply_data,
                                'user_avatar': reply_data.get('user_profile', {}).get('avatar_url'),
                            }
                        }

                    # Generate AI reply from the assigned agent
                    ai_reply_data = {
                        'ticket_id': ticket['id'],
                        'content': ai_response,
                        'user_id': assigned_agent_id,
                        'is_public': True,
                        'is_ai_generated': True
                    }

                    # Insert AI reply
                    ai_reply_result = supabase_client.table('replies').insert(ai_reply_data).execute()

                    if ai_reply_result.error:
                        logger.error('Error creating AI reply: %s', ai_reply_result.error)
                    else:
                        logger.info('AI reply created successfully')
                        ai_reply_data = ai_reply_result.data[0]
            except Exception as e:
                logger.error('Error generating AI response: %s', str(e))

        # Notify about ticket update
        try:
            await notify_ticket_created(supabase_client, ticket, user)
        except Exception as e:
            logger.error('Error creating notification: %s', str(e))

        return {
            'ticket': {
                **ticket,
                'isNewTicket': True
            },
            'ai_response': ai_response
        }

    except Exception as error:
        logger.error('Error in create_ticket: %s', str(error))
        return JSONResponse(
            content={
                'error': str(error),
                'details': getattr(error, 'details', None)
            },
            status_code=400
        )