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
from .utils.formatting import format_ticket_numbers
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
                # Updated pattern to handle email addresses without @ prefix
                assigned_to_match = re.search(r'assigned_to:\s*(unassigned|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?=\s|$)', details, re.IGNORECASE)
                
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
                    logger.info("Found assigned_to match: %s", assignee)
                    
                    if assignee.lower() == 'unassigned':
                        updates['assigned_to'] = None
                    else:
                        # Extract email from the raw content
                        # The MentionInput component sends the email in the format: assigned_to: john.doe@example.com
                        # Remove any @ prefix if present as the email is stored without it
                        assignee_email = assignee.lstrip('@')
                        logger.info("Looking up agent with email (after processing): %s", assignee_email)
                        
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
        When user asks to update unassigned tickets: "ACTION: UPDATE ticket: unassigned field1: value1"
        When user asks to update unassigned tickets to a user (email): "ACTION: UPDATE ticket: 43,46 assigned_to: email_here"

        IMPORTANT: DO NOT ADD FIELDS THAT THE USER DIDN'T REQUEST. YOU MUST REPLACE THE FIELD AND VALUE.

        Here are the fields along with their values:
        status: open, pending, solved, closed
        priority: low, normal, high, urgent
        ticket_type: question, incident, problem, task
        group_name: Admin, Support
        assigned_to: email (e.g., assigned_to: john.doe@example.com) - Do not include @ prefix in email
        assigned_to: unassigned (to remove assignment)

        IMPORTANT: If the user specifies to update unassigned tickets, please just use "assigned_to: unassigned". Do not assume they want to update certain tickets.

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
    7. For assigning tickets, use the exact email format without @ prefix (e.g., assigned_to: john.doe@example.com)"""

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

        # Store user message with both content and display_content
        supabase.table('autocrm_messages').insert({
            'conversation_id': conversation_id,
            'sender': 'user',
            'content': query,  # Raw text with emails
            'display_content': display_content or query  # HTML with styled mentions
        }).execute()

        # Get conversation history
        messages_data = supabase.table('autocrm_messages') \
            .select('sender,content,display_content') \
            .eq('conversation_id', conversation_id) \
            .order('created_at', desc=False) \
            .limit(10) \
            .execute()

        # Format history for the prompt using display_content for better readability
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

        # Log the full prompt being sent to the LLM
        prompt_input = {
            'input': query,
            'history': history or ''
        }
        formatted_prompt = prompt.format_messages(**prompt_input)
        logger.info("Full prompt being sent to LLM:")
        for message in formatted_prompt:
            logger.info("Role: %s", message.type)
            logger.info("Content:\n%s", message.content)

        # Run the chain
        result = await chain.ainvoke(prompt_input)

        # Log the raw LLM response with clear separator for visibility
        logger.info("=" * 50)
        logger.info("Raw LLM response (ACTION):\n%s", result)
        logger.info("=" * 50)

        # Process the result
        response = await handle_crm_operations(result, user_id, supabase)

        # Log the processed response
        logger.info("Processed CRM response:\n%s", response)

        # Store AI response
        supabase.table('autocrm_messages').insert({
            'conversation_id': conversation_id,
            'sender': 'system',
            'content': response,  # For system responses, content and display_content are the same
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