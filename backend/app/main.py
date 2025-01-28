from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langsmith import Client
from supabase import create_client, Client as SupabaseClient
from typing import Optional, Dict, Any
import os
from dotenv import load_dotenv
import json
from .utils.notifications import notify_ticket_updated
from datetime import datetime
import logging
import re

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

# Log environment variables (excluding sensitive values)
logger.info(f"SUPABASE_URL set: {bool(os.getenv('SUPABASE_URL'))}")
logger.info(f"SUPABASE_SERVICE_ROLE_KEY set: {bool(os.getenv('SUPABASE_SERVICE_ROLE_KEY'))}")
logger.info(f"OPENAI_API_KEY set: {bool(os.getenv('OPENAI_API_KEY'))}")
logger.info(f"LANGCHAIN_API_KEY set: {bool(os.getenv('LANGCHAIN_API_KEY'))}")
logger.info(f"LANGCHAIN_PROJECT set: {os.getenv('LANGCHAIN_PROJECT')}")

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

app = FastAPI(
    title="AutoCRM API",
    description="API for handling CRM operations with AI assistance",
    version="1.0.0"
)

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

# CORS middleware
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

# Initialize Supabase client
try:
    supabase: SupabaseClient = create_client(
        os.getenv("SUPABASE_URL", ""),
        os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    )
    logger.info("Supabase client initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize Supabase client: {str(e)}")
    raise

@app.get("/health")
async def health_check():
    """
    Health check endpoint to verify the API is running.
    """
    try:
        # Test Supabase connection
        logger.info("Testing Supabase connection...")
        user = supabase.auth.get_user("test")
        logger.info("Supabase connection test successful")
        return {
            "status": "healthy",
            "services": {
                "api": "up",
                "supabase": "up"
            },
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return {
            "status": "unhealthy",
            "services": {
                "api": "up",
                "supabase": "down",
                "error": str(e)
            },
            "timestamp": datetime.now().isoformat()
        }

async def handle_crm_operations(result: str, user_id: str, supabase_client: SupabaseClient) -> str:
    try:
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
                query_match = details.split('query:', 1)
                search_query = query_match[1].strip() if len(query_match) > 1 else details.strip()
                
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
                
                # Apply search filter if provided
                if search_query:
                    filtered_tickets = [
                        t for t in tickets.data
                        if search_query.lower() in t['subject'].lower() or
                        (t.get('description', '') and search_query.lower() in t['description'].lower())
                    ]
                    tickets.data = filtered_tickets
                
                if tickets.data:
                    # Remove duplicates based on ticket ID
                    unique_tickets = {t['id']: t for t in tickets.data}.values()
                    ticket_summary = '\n'.join([f"#{t['id']}: {t['subject']} ({t['status']})" for t in unique_tickets])
                    responses.append(f"I found these tickets:\n{ticket_summary}")
                else:
                    responses.append('No tickets found matching your search.')
                    
            elif action.upper() == 'UPDATE':
                logger.info("Processing UPDATE action")
                # Updated regex to handle unassigned tickets and ranges
                ticket_match = re.search(r'ticket:\s*([\d,\s\-]+|unassigned)(?=\s|$)', details, re.IGNORECASE)
                priority_match = re.search(r'priority:\s*(\w+)(?=\s|$)', details)
                status_match = re.search(r'status:\s*(\w+)(?=\s|$)', details)
                group_match = re.search(r'group_name:\s*(\w+)(?=\s|$)', details)
                assigned_to_match = re.search(r'assigned_to:\s*(?:@?([^\s]+))(?=\s|$)', details)
                
                logger.info("Regex matches: %s", {
                    'ticket_match': ticket_match.group(1) if ticket_match else None,
                    'priority_match': priority_match.group(1) if priority_match else None,
                    'status_match': status_match.group(1) if status_match else None,
                    'group_match': group_match.group(1) if group_match else None,
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
                        
                if assigned_to_match:
                    assignee = assigned_to_match.group(1)
                    if assignee.lower() == 'unassigned':
                        updates['assigned_to'] = None
                    else:
                        assignee_email = assignee
                        assignee_data = supabase_client.table('profiles').select('id').eq('email', assignee_email).execute()
                        if assignee_data.data:
                            updates['assigned_to'] = assignee_data.data[0]['id']
                        else:
                            responses.append(f'Could not find agent with email {assignee_email}')
                            continue
                
                logger.info("Final updates object: %s", updates)
                
                # Process ticket IDs
                ticket_ids = []
                if ticket_ids_str.lower() == 'unassigned':
                    logger.info("Fetching unassigned tickets...")
                    unassigned_tickets = supabase_client.table('tickets').select('id').is_('assigned_to', None).execute()
                    if unassigned_tickets.data:
                        ticket_ids = [t['id'] for t in unassigned_tickets.data]
                        logger.info("Found unassigned ticket IDs: %s", ticket_ids)
                    else:
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
                            await notify_ticket_updated(
                                supabase_client,
                                updated_ticket.data[0],
                                {'id': user_id, 'user_metadata': {'role': user_info.data[0]['role'], 'full_name': 'AutoCRM'}},
                                previous_ticket
                            )
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
                    fields_updated = ', '.join([f"{k.replace('_', ' ').title()}: {v}" for k, v in updates.items()])
                    response_parts.append(f"Successfully updated tickets {', '.join(map(str, successful))} with {fields_updated}")
                if failed:
                    response_parts.append(f"Failed to update tickets: {', '.join([f'#{id} ({error})' for id, error in failed])}")
                
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
        query = request.get('query')
        user_id = request.get('userId')
        display_content = request.get('displayContent')
        logger.info(f"Request data - query: {query}, user_id: {user_id}")

        if not query or not user_id:
            logger.error("Missing required fields in request")
            raise HTTPException(status_code=400, detail="Query and userId are required")

        # Initialize LangChain components
        logger.info("Initializing LangChain components")
        system_prompt = """You are an AI assistant helping with CRM tasks. You must respond in a structured format that starts with an ACTION: followed by the action type and any relevant details.

    Available actions:
    1. ACTION: SEARCH - For finding tickets (e.g., "ACTION: SEARCH query: payment issue")
    2. ACTION: UPDATE - For updating tickets. IMPORTANT: When updating multiple tickets, you MUST use a single UPDATE action.

        Please follow this format for updating multiple tickets (we could add more fields than this):

        When user asks to update only one field: "ACTION: UPDATE ticket: field: value"
        When user asks to update two fields: "ACTION: UPDATE ticket: 43-47 field1: value1 field2: value2"
        Mixed format updating one field: "ACTION: UPDATE ticket: 43-45,47,49-51 field1: value1"

        IMPORTANT: DO NOT ADD FIELDS THAT THE USER DIDN'T REQUEST. YOU MUST REPLACE THE FIELD AND VALUE.

        Here are the fields along with their values:
        status: open, pending, solved, closed
        priority: low, normal, high, urgent
        ticket_type: question, incident, problem, task
        group_name: Admin, Support
        assigned_to: @email (e.g., assigned_to: @john.doe@example.com)
        assigned_to: unassigned (to remove assignment)

        Please use these to plug into the format given the user's request.

    3. ACTION: CREATE - For creating tickets (e.g., "ACTION: CREATE subject: Customer reported login issue")
    4. ACTION: INFO - For getting customer info (e.g., "ACTION: INFO customer: 123")

    Keep responses concise and professional. Always start with ACTION: followed by the type.
    
    CRITICAL INSTRUCTIONS FOR UPDATES:
    1. ONLY include fields the user explicitly asks to update
    2. ALWAYS use a single UPDATE action for multiple tickets
    3. For consecutive numbers, use ranges (e.g., 43-47)
    4. For unassigned tickets, use "assigned_to: unassigned"
    5. NEVER split updates into multiple actions
    6. NEVER add fields that weren't requested
    7. For assigning tickets, use the exact @email format provided by the user or "unassigned" to remove assignment"""

        human_prompt = """Previous conversation:
{history}

Current request: {input}"""

        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", human_prompt),
        ])

        # Get conversation history
        logger.info("Fetching conversation history")
        conv_data = supabase.table('autocrm_conversations') \
            .select('id') \
            .eq('user_id', user_id) \
            .order('updated_at', desc=True) \
            .limit(1) \
            .execute()

        conversation_id = None
        if conv_data.data:
            conversation_id = conv_data.data[0]['id']
        else:
            # Create new conversation
            conv_result = supabase.table('autocrm_conversations') \
                .insert({'user_id': user_id}) \
                .execute()
            conversation_id = conv_result.data[0]['id']

        # Store user message
        supabase.table('autocrm_messages').insert({
            'conversation_id': conversation_id,
            'sender': 'user',
            'content': query,
            'display_content': display_content or query
        }).execute()

        # Get conversation history
        messages_data = supabase.table('autocrm_messages') \
            .select('sender,content,display_content') \
            .eq('conversation_id', conversation_id) \
            .order('created_at', desc=False) \
            .limit(10) \
            .execute()

        # Format history for the prompt using display_content
        history = '\n'.join([
            f"{msg['sender']}: {msg['display_content']}"
            for msg in messages_data.data
        ])

        # Initialize model with tracing enabled
        model = ChatOpenAI(
            openai_api_key=openai_api_key,
            model_name='gpt-4o-mini',
            temperature=0.7,
            tags=["autocrm"],
            metadata={
                "user_id": user_id,
                "user_role": user_role,
                "conversation_id": conversation_id
            }
        )

        # Create chain with tracing
        chain = prompt.pipe(model).pipe(StrOutputParser())

        # Add logging for chain execution
        logger.info("Starting chain execution with input: %s", {
            'input': query,
            'history': history or ''
        })

        # Run the chain
        result = await chain.ainvoke({
            'input': query,
            'history': history or ''
        })

        logger.info("Chain execution result: %s", result)

        # Process the result
        response = await handle_crm_operations(result, user_id, supabase)

        # Store AI response
        supabase.table('autocrm_messages').insert({
            'conversation_id': conversation_id,
            'sender': 'system',
            'content': response,
            'display_content': response
        }).execute()

        # Update conversation timestamp
        supabase.table('autocrm_conversations') \
            .update({'updated_at': datetime.now().isoformat()}) \
            .eq('id', conversation_id) \
            .execute()

        return {"reply": response}

    except Exception as e:
        logger.error(f"Error in handle_autocrm: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) 