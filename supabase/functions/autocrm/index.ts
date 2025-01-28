import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ChatOpenAI } from "npm:@langchain/openai@0.3.0"
import { SystemMessage, HumanMessage } from "npm:@langchain/core@0.3.33/messages"
import { StringOutputParser } from "npm:@langchain/core@0.1.48/output_parsers"
import { ChatPromptTemplate } from "npm:@langchain/core@0.1.48/prompts"
import { Client } from "npm:langsmith@0.0.48"
import { z } from "https://deno.land/x/zod@v3.21.4/mod.ts"
import { notifyTicketUpdated } from "../_shared/notifications.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// Types for CRM operations
type TicketStatus = 'open' | 'pending' | 'solved' | 'closed'
type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'
type TicketType = 'question' | 'incident' | 'problem' | 'task'
type TicketTopic = 
  | 'Order & Shipping Issues'
  | 'Billing & Account Concerns'
  | 'Communication & Customer Experience'
  | 'Policy, Promotions & Loyalty Programs'
  | 'Product & Service Usage'

interface CRMOperations {
  searchTickets: (query: string, userId: string) => Promise<any[]>;
  updateTicket: (ticketId: number, updates: any, userId: string) => Promise<any>;
  createTicket: (data: any, userId: string) => Promise<any>;
  getCustomerInfo: (customerId: string) => Promise<any>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create service role client for admin operations
    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Get user from auth token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const { data: { user }, error: userError } = await serviceRoleClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (userError || !user) {
      throw new Error('Invalid token')
    }

    // Check if user is agent or admin
    const isAgentOrAdmin = user.user_metadata?.role === 'agent' || user.user_metadata?.role === 'admin'
    if (!isAgentOrAdmin) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized. Only agents and admins can use AutoCRM.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    const langsmithApiKey = Deno.env.get('LANGSMITH_API_KEY')
    
    if (!openaiApiKey) {
      console.error('OpenAI API key is missing. Please set it in Supabase Dashboard > Project Settings > Edge Functions')
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured. Please contact support.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize base model and chain
    let model;
    let promptTemplate;
    let chain;

    // Get request data first
    const { query, userId } = await req.json()

    if (!query || !userId) {
      throw new Error('Query and userId are required')
    }

    // Initialize LangSmith client and configure tracing
    let tracingCallbacks = undefined;
    if (langsmithApiKey) {
      const client = new Client({
        apiUrl: "https://api.smith.langchain.com",
        apiKey: langsmithApiKey,
      });

      // Configure single trace for LLM only
      tracingCallbacks = [{
        handleLLMStart: async (llm: any, prompts: string[]) => {
          console.log("AutoCRM LLM Started");
          try {
            await client.createRun({
              name: "AutoCRM LLM",
              run_type: "llm",
              inputs: { prompts },
              project_name: "zenny-autocrm",
              start_time: new Date().toISOString(),
              tags: ["production", "autocrm"],
              metadata: {
                userId: userId,
                timestamp: new Date().toISOString()
              }
            });
          } catch (error) {
            console.error("Error creating LLM run:", error);
          }
        },
        handleLLMEnd: async (output: any) => {
          console.log("AutoCRM LLM Finished - Raw output:", JSON.stringify(output, null, 2));
          try {
            if (!currentRunId) {
              console.error("No run ID found for LangSmith update");
              return;
            }

            // Format the output properly for LangSmith
            const formattedOutput = typeof output === 'object' ? 
              { response: output.response || output.text || JSON.stringify(output) } : 
              { response: String(output) };
            
            console.log("Formatted output for LangSmith:", JSON.stringify(formattedOutput, null, 2));
            
            await client.updateRun({
              id: currentRunId,
              end_time: new Date().toISOString(),
              outputs: formattedOutput
            });
            console.log("Successfully updated LangSmith run:", currentRunId);
          } catch (error) {
            console.error("Error updating LLM run:", error);
            console.error("Error details:", {
              runId: currentRunId,
              outputType: typeof output,
              outputValue: output,
              message: error.message,
              name: error.name,
              stack: error.stack,
              cause: error.cause
            });
          }
        }
      }];

      // Apply callbacks to model instead of chain
      model = new ChatOpenAI({
        openAIApiKey: openaiApiKey,
        modelName: 'gpt-4o-mini',
        temperature: 0.7,
        callbacks: tracingCallbacks
      });
    } else {
      model = new ChatOpenAI({
        openAIApiKey: openaiApiKey,
        modelName: 'gpt-4o-mini',
        temperature: 0.7
      });
    }

    // Create the prompt template
    const systemPrompt = `You are an AI assistant helping with CRM tasks. You must respond in a structured format that starts with an ACTION: followed by the action type and any relevant details.

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
        assigned_to: @[agent_email] (e.g., assigned_to: @john.doe@example.com)
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
    7. For assigning tickets, use the exact @email format provided by the user or "unassigned" to remove assignment`;

    const humanPrompt = `Previous conversation:
{history}

Current request: {input}`;

    promptTemplate = ChatPromptTemplate.fromMessages([
      ["system", systemPrompt],
      ["human", humanPrompt]
    ]);

    // Create the chain without tracing config
    chain = promptTemplate
      .pipe(model)
      .pipe(new StringOutputParser());

    // Initialize CRM operations with service role client
    const crmOps: CRMOperations = {
      searchTickets: async (query: string, userId: string) => {
        const { data: userInfo } = await serviceRoleClient
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single();

        let ticketsQuery = serviceRoleClient
          .from('tickets')
          .select(`
            *,
            profiles!tickets_user_id_fkey (email, name),
            agents:profiles!tickets_assigned_to_fkey (email, name)
          `);

        // Apply role-based filters
        if (userInfo?.role === 'agent') {
          ticketsQuery = ticketsQuery.or(`status.eq.open,assigned_to.eq.${userId}`).neq('group_name', 'Admin');
        } else if (userInfo?.role === 'admin') {
          ticketsQuery = ticketsQuery.or(`status.eq.open,assigned_to.eq.${userId}`);
        }

        // Add text search if query provided
        if (query) {
          ticketsQuery = ticketsQuery.or(`subject.ilike.%${query}%,description.ilike.%${query}%`);
        }

        const { data, error } = await ticketsQuery;
        if (error) throw error;
        return data;
      },

      updateTicket: async (ticketId: number, updates: any, userId: string) => {
        const { data: ticket } = await serviceRoleClient
          .from('tickets')
          .select('*')
          .eq('id', ticketId)
          .single();

        if (!ticket) throw new Error('Ticket not found');

        // Verify user has permission to update
        const { data: userInfo } = await serviceRoleClient
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single();

        if (!userInfo) throw new Error('User not found');

        if (userInfo.role === 'agent' && ticket.group_name === 'Admin') {
          throw new Error('Agents cannot modify Admin group tickets');
        }

        // Store previous ticket state for notification
        const previousTicket = { ...ticket };

        const { data: updatedTicket, error } = await serviceRoleClient
          .from('tickets')
          .update(updates)
          .eq('id', ticketId)
          .select()
          .single();

        if (error) throw error;

        // Create notification for the update with AutoCRM as the updater name
        await notifyTicketUpdated(
          serviceRoleClient,
          updatedTicket,
          { id: userId, user_metadata: { ...userInfo, full_name: 'AutoCRM' } },
          previousTicket
        );

        return updatedTicket;
      },

      createTicket: async (data: any, userId: string) => {
        const { data: ticket, error } = await serviceRoleClient
          .from('tickets')
          .insert({
            ...data,
            user_id: userId,
            status: data.status || 'open',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (error) throw error;
        return ticket;
      },

      getCustomerInfo: async (customerId: string) => {
        const { data, error } = await serviceRoleClient
          .from('profiles')
          .select('*')
          .eq('id', customerId)
          .single();

        if (error) throw error;
        return data;
      }
    };

    // Get or create a conversation
    const { data: existingConv, error: convError } = await serviceRoleClient
      .from('autocrm_conversations')
      .select('id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    if (convError && convError.code !== 'PGRST116') {
      throw convError
    }

    let conversationId = existingConv?.id

    if (!conversationId) {
      const { data: newConv, error: createError } = await serviceRoleClient
        .from('autocrm_conversations')
        .insert({ user_id: userId })
        .select('id')
        .single()

      if (createError) throw createError
      conversationId = newConv.id
    }

    // Store user message
    await serviceRoleClient
      .from('autocrm_messages')
      .insert({
        conversation_id: conversationId,
        sender: 'user',
        content: query,
      })

    // Get conversation history
    const { data: messages, error: messagesError } = await serviceRoleClient
      .from('autocrm_messages')
      .select('sender, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(10)

    if (messagesError) throw messagesError

    // Format history for the prompt
    const history = messages
      .map((msg) => `${msg.sender}: ${msg.content}`)
      .join('\n')

    // Add logging for chain execution
    console.log("Starting chain execution with input:", JSON.stringify({
      input: query,
      history: history || ''
    }, null, 2));

    // Run the chain
    const result = await chain.invoke({
      input: query,
      history: history || ''
    });

    console.log("Chain execution result:", JSON.stringify(result, null, 2));

    let aiResponse = '';

    // Handle the structured output
    try {
      console.log("Raw result from LLM:", result);
      
      // Split response into multiple actions if present (but we should only get one)
      const actions = result.split(/\n+/).filter(line => line.trim().startsWith('ACTION:'));
      console.log("Split actions:", JSON.stringify(actions, null, 2));

      if (actions.length > 1) {
        console.warn("WARNING: LLM generated multiple actions instead of using range syntax");
      }

      if (actions.length > 0) {
        const responses = [];
        
        for (const actionText of actions) {
          const actionMatch = actionText.match(/^ACTION: (\w+)(.*)$/i);
          console.log("Processing action:", actionText);
          console.log("Action match result:", JSON.stringify(actionMatch, null, 2));
          
          if (actionMatch) {
            const [_, action, details] = actionMatch;
            console.log("Parsed action:", action);
            console.log("Action details:", details);
            
            let actionResponse = '';
            switch(action.toUpperCase()) {
              case 'SEARCH': {
                const queryMatch = details.match(/query:\s*([^\n]+)/)
                const searchQuery = queryMatch ? queryMatch[1].trim() : query
                const tickets = await crmOps.searchTickets(searchQuery, userId)
                const ticketSummary = tickets.map(t => `#${t.id}: ${t.subject} (${t.status})`).join('\n')
                actionResponse = tickets.length > 0 
                  ? `I found these tickets:\n${ticketSummary}`
                  : 'No tickets found matching your search.'
                break
              }
              
              case 'UPDATE': {
                console.log("Processing UPDATE action");
                // Updated regex to handle unassigned tickets and ranges
                const ticketMatch = details.match(/ticket:\s*([\d,\s\-]+|unassigned)(?=\s|$)/i);
                const priorityMatch = details.match(/priority:\s*(\w+)(?=\s|$)/);
                const statusMatch = details.match(/status:\s*(\w+)(?=\s|$)/);
                const groupMatch = details.match(/group:\s*(\w+)(?=\s|$)/);
                // Updated pattern to handle both @unassigned and unassigned
                const assignedToMatch = details.match(/assigned_to:\s*(?:@?([^\s]+))(?=\s|$)/);
                
                console.log("Regex matches:", {
                  ticketMatch: ticketMatch ? ticketMatch[1] : null,
                  priorityMatch: priorityMatch ? priorityMatch[1] : null,
                  statusMatch: statusMatch ? statusMatch[1] : null,
                  groupMatch: groupMatch ? groupMatch[1] : null,
                  assignedToMatch: assignedToMatch ? assignedToMatch[1] : null
                });

                if (ticketMatch) {
                  const updates: any = {};
                  
                  if (priorityMatch) {
                    const priorityInput = priorityMatch[1].toLowerCase();
                    console.log("Processing priority:", priorityInput);
                    switch (priorityInput) {
                      case 'low': updates.priority = 'low'; break;
                      case 'normal': updates.priority = 'normal'; break;
                      case 'high': updates.priority = 'high'; break;
                      case 'urgent': updates.priority = 'urgent'; break;
                      default: throw new Error('Invalid priority. Must be "low", "normal", "high", or "urgent" (case insensitive)');
                    }
                  }

                  if (statusMatch) {
                    const statusInput = statusMatch[1].toLowerCase();
                    console.log("Processing status:", statusInput);
                    switch (statusInput) {
                      case 'open': updates.status = 'open'; break;
                      case 'pending': updates.status = 'pending'; break;
                      case 'solved': updates.status = 'solved'; break;
                      case 'closed': updates.status = 'closed'; break;
                      default: throw new Error('Invalid status. Must be "open", "pending", "solved", or "closed" (case insensitive)');
                    }
                  }

                  if (groupMatch) {
                    const groupInput = groupMatch[1].toLowerCase();
                    console.log("Processing group:", groupInput);
                    switch (groupInput) {
                      case 'admin': updates.group_name = 'Admin'; break;
                      case 'support': updates.group_name = 'Support'; break;
                      default: throw new Error('Invalid group name. Must be "Admin" or "Support" (case insensitive)');
                    }
                  }

                  if (assignedToMatch) {
                    const assigneeEmail = assignedToMatch[1];
                    if (assigneeEmail.toLowerCase() === 'unassigned') {
                      updates.assigned_to = null;
                    } else {
                      // Get the assignee's ID from their email
                      const { data: assignee, error: assigneeError } = await serviceRoleClient
                        .from('profiles')
                        .select('id')
                        .eq('email', assigneeEmail)
                        .single();

                      if (assigneeError || !assignee) {
                        throw new Error(`Could not find agent with email ${assigneeEmail}`);
                      }
                      
                      updates.assigned_to = assignee.id;
                    }
                  }

                  console.log("Final updates object:", updates);
                  
                  let ticketIds: number[] = [];
                  
                  // Handle unassigned tickets
                  if (ticketMatch[1].toLowerCase() === 'unassigned') {
                    console.log("Fetching unassigned tickets...");
                    const { data: unassignedTickets, error } = await serviceRoleClient
                      .from('tickets')
                      .select('id')
                      .is('assigned_to', null);
                      
                    if (error) {
                      console.error("Error fetching unassigned tickets:", error);
                      actionResponse = 'Failed to fetch unassigned tickets';
                      break;
                    }
                    
                    ticketIds = unassignedTickets.map(t => t.id);
                    console.log("Found unassigned ticket IDs:", ticketIds);
                  } else {
                    // Process normal ticket IDs or ranges
                    const rawTicketIds = ticketMatch[1].split(',');
                    console.log("Raw ticket segments:", rawTicketIds);
                    
                    ticketIds = rawTicketIds.flatMap(segment => {
                      segment = segment.trim();
                      console.log(`Processing segment: "${segment}"`);
                      
                      // Check if it's a range (e.g., "43-47")
                      const rangeMatch = segment.match(/^(\d+)-(\d+)$/);
                      if (rangeMatch) {
                        const start = parseInt(rangeMatch[1]);
                        const end = parseInt(rangeMatch[2]);
                        console.log(`Found range: ${start} to ${end}`);
                        
                        if (isNaN(start) || isNaN(end)) {
                          console.log("Invalid range numbers");
                          return [];
                        }
                        
                        if (end < start) {
                          console.log("Invalid range: end is less than start");
                          return [];
                        }
                        
                        if (end - start > 50) {
                          console.log("Range too large: maximum 50 tickets at once");
                          return [];
                        }
                        
                        // Generate array of numbers in the range
                        return Array.from(
                          { length: end - start + 1 },
                          (_, i) => start + i
                        );
                      }
                      
                      // Single number
                      const parsed = parseInt(segment);
                      console.log(`Parsing single ID: "${segment}" -> ${parsed}`);
                      return isNaN(parsed) ? [] : [parsed];
                    });
                  }

                  console.log("Final parsed ticket IDs:", ticketIds);
                  
                  if (ticketIds.length === 0) {
                    actionResponse = ticketMatch[1].toLowerCase() === 'unassigned' 
                      ? 'No unassigned tickets found'
                      : 'Please specify valid ticket numbers (e.g., "ticket: 44,45" or "ticket: 43-47")';
                    break;
                  }
                  
                  if (ticketIds.length > 50) {
                    actionResponse = 'You can only update up to 50 tickets at once';
                    break;
                  }

                  // Update all tickets and collect results
                  console.log("Starting ticket updates...");
                  const updateResults = await Promise.all(
                    ticketIds.map(async (ticketId) => {
                      try {
                        console.log(`Updating ticket ${ticketId} with:`, updates);
                        const updatedTicket = await crmOps.updateTicket(ticketId, updates, userId);
                        console.log(`Successfully updated ticket ${ticketId}`);
                        return { ticketId, success: true };
                      } catch (error) {
                        console.error(`Failed to update ticket ${ticketId}:`, error);
                        return { ticketId, success: false, error: error.message };
                      }
                    })
                  );

                  console.log("Update results:", JSON.stringify(updateResults, null, 2));

                  // Format response message
                  const successfulUpdates = updateResults.filter(r => r.success);
                  const failedUpdates = updateResults.filter(r => !r.success);

                  const updateSummary = [];
                  if (successfulUpdates.length > 0) {
                    const ticketList = successfulUpdates.map(r => `#${r.ticketId}`).join(', ');
                    updateSummary.push(`Successfully updated tickets ${ticketList} with: ${
                      Object.entries(updates)
                        .map(([key, value]) => {
                          // Special handling for assigned_to field
                          if (key === 'assigned_to' && value === null) {
                            return 'Assigned To set to Unassigned';
                          }
                          return `${key} set to ${String(value).charAt(0).toUpperCase() + String(value).slice(1)}`;
                        })
                        .join(', ')
                    }`);
                  }
                  if (failedUpdates.length > 0) {
                    const failureList = failedUpdates.map(r => `#${r.ticketId} (${r.error})`).join(', ');
                    updateSummary.push(`Failed to update tickets: ${failureList}`);
                  }

                  actionResponse = updateSummary.join('\n');
                  console.log("Final AI response:", actionResponse);
                } else {
                  actionResponse = 'Please specify which tickets to update (e.g., "ticket: 44, 45")';
                }
                break
              }
              
              case 'CREATE': {
                const subjectMatch = details.match(/subject:\s*([^\n]+)/)
                const subject = subjectMatch ? subjectMatch[1].trim() : query
                
                const newTicket = await crmOps.createTicket({
                  subject,
                  status: 'open',
                  priority: 'normal'
                }, userId)
                actionResponse = `Created new ticket #${newTicket.id} with subject: ${subject}`
                break
              }
              
              case 'INFO': {
                const customerMatch = details.match(/customer:\s*(\w+)/)
                const customerId = customerMatch ? customerMatch[1] : userId
                
                const customerInfo = await crmOps.getCustomerInfo(customerId)
                actionResponse = `Customer Information:\nName: ${customerInfo.name}\nEmail: ${customerInfo.email}`
                break
              }
              
              default:
                actionResponse = "I don't understand that action. Please try rephrasing your request."
            }
            if (actionResponse) {
              responses.push(actionResponse);
            }
          }
        }
        
        aiResponse = responses.join('\n');
      } else {
        aiResponse = "I couldn't understand your request. Please try rephrasing it."
      }
    } catch (error) {
      console.error('Error executing CRM operation:', error)
      aiResponse = "I encountered an error while processing your request. Please try again."
    }

    // Store AI response
    await serviceRoleClient
      .from('autocrm_messages')
      .insert({
        conversation_id: conversationId,
        sender: 'system',
        content: aiResponse,
      })

    // Update conversation timestamp
    await serviceRoleClient
      .from('autocrm_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId)

    return new Response(
      JSON.stringify({ reply: aiResponse }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      stack: error.stack,
      cause: error.cause
    })
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
}) 