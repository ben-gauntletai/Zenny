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

      // Configure manual tracing callbacks
      tracingCallbacks = [{
        handleLLMStart: async (llm: any, prompts: string[]) => {
          console.log("LLM Started:", llm.name);
          try {
            await client.createRun({
              name: "AutoCRM LLM",
              run_type: "llm",
              inputs: { prompts },
              project_name: "zenny-autocrm",
              start_time: new Date().toISOString()
            });
          } catch (error) {
            console.error("Error creating LLM run:", error);
          }
        },
        handleLLMEnd: async (output: any) => {
          console.log("LLM Finished");
          try {
            await client.updateRun({
              end_time: new Date().toISOString(),
              outputs: output
            });
          } catch (error) {
            console.error("Error updating LLM run:", error);
          }
        },
        handleChainStart: async (chain: any, inputs: Record<string, any>) => {
          console.log("Chain Started:", chain.name);
          try {
            await client.createRun({
              name: "AutoCRM Chain",
              run_type: "chain",
              inputs,
              project_name: "zenny-autocrm",
              start_time: new Date().toISOString(),
              tags: ["production", "autocrm"],
              metadata: {
                userId: userId,
                timestamp: new Date().toISOString()
              }
            });
          } catch (error) {
            console.error("Error creating chain run:", error);
          }
        },
        handleChainEnd: async (outputs: Record<string, any>) => {
          console.log("Chain Finished");
          try {
            await client.updateRun({
              end_time: new Date().toISOString(),
              outputs
            });
          } catch (error) {
            console.error("Error updating chain run:", error);
          }
        }
      }];
    }

    // Initialize ChatOpenAI with tracing callbacks
    model = new ChatOpenAI({
      openAIApiKey: openaiApiKey,
      modelName: 'gpt-4o-mini',
      temperature: 0.7,
      callbacks: tracingCallbacks
    });

    // Create the prompt template
    const systemPrompt = `You are an AI assistant helping with CRM tasks. You must respond in a structured format that starts with an ACTION: followed by the action type and any relevant details.

    Available actions:
    1. ACTION: SEARCH - For finding tickets (e.g., "ACTION: SEARCH query: payment issue")
    2. ACTION: UPDATE - For updating tickets (e.g., "ACTION: UPDATE ticket: 44 priority: low")
    3. ACTION: CREATE - For creating tickets (e.g., "ACTION: CREATE subject: Customer reported login issue")
    4. ACTION: INFO - For getting customer info (e.g., "ACTION: INFO customer: 123")

    Keep responses concise and professional. Always start with ACTION: followed by the type.
    Available ticket statuses: open, pending, solved, closed
    Available priorities: low, normal, high, urgent`;

    const humanPrompt = `Previous conversation:
{history}

Current request: {input}`;

    promptTemplate = ChatPromptTemplate.fromMessages([
      ["system", systemPrompt],
      ["human", humanPrompt]
    ]);

    // Create the chain with proper configuration
    chain = promptTemplate
      .pipe(model)
      .pipe(new StringOutputParser());

    // Add tracing configuration if available
    if (tracingCallbacks) {
      chain = chain.withConfig({
        callbacks: tracingCallbacks,
        tags: ["production", "autocrm"],
        metadata: {
          userId: userId,
          timestamp: new Date().toISOString()
        }
      });
    }

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

    // Run the chain
    const result = await chain.invoke({
      input: query,
      history: history || ''  // Provide empty string as fallback
    })

    let aiResponse = ''

    // Handle the structured output
    try {
      const actionMatch = result.match(/^ACTION: (\w+)(.*)$/i)
      
      if (actionMatch) {
        const [_, action, details] = actionMatch
        
        switch(action.toUpperCase()) {
          case 'SEARCH': {
            const queryMatch = details.match(/query:\s*([^\n]+)/)
            const searchQuery = queryMatch ? queryMatch[1].trim() : query
            const tickets = await crmOps.searchTickets(searchQuery, userId)
            const ticketSummary = tickets.map(t => `#${t.id}: ${t.subject} (${t.status})`).join('\n')
            aiResponse = tickets.length > 0 
              ? `I found these tickets:\n${ticketSummary}`
              : 'No tickets found matching your search.'
            break
          }
          
          case 'UPDATE': {
            const ticketMatch = details.match(/ticket:\s*(\d+)/)
            const priorityMatch = details.match(/priority:\s*(\w+)/)
            const statusMatch = details.match(/status:\s*(\w+)/)
            const groupMatch = details.match(/group:\s*(\w+)/)
            
            if (ticketMatch) {
              const updates: any = {}
              
              if (priorityMatch) {
                const priorityInput = priorityMatch[1].toLowerCase()
                switch (priorityInput) {
                  case 'low': updates.priority = 'low'; break;
                  case 'normal': updates.priority = 'normal'; break;
                  case 'high': updates.priority = 'high'; break;
                  case 'urgent': updates.priority = 'urgent'; break;
                  default: throw new Error('Invalid priority. Must be "low", "normal", "high", or "urgent" (case insensitive)');
                }
              }

              if (statusMatch) {
                const statusInput = statusMatch[1].toLowerCase()
                switch (statusInput) {
                  case 'open': updates.status = 'open'; break;
                  case 'pending': updates.status = 'pending'; break;
                  case 'solved': updates.status = 'solved'; break;
                  case 'closed': updates.status = 'closed'; break;
                  default: throw new Error('Invalid status. Must be "open", "pending", "solved", or "closed" (case insensitive)');
                }
              }

              if (groupMatch) {
                const groupInput = groupMatch[1].toLowerCase()
                switch (groupInput) {
                  case 'admin': updates.group_name = 'Admin'; break;
                  case 'support': updates.group_name = 'Support'; break;
                  default: throw new Error('Invalid group name. Must be "Admin" or "Support" (case insensitive)');
                }
              }
              
              const ticketId = parseInt(ticketMatch[1])
              const updatedTicket = await crmOps.updateTicket(ticketId, updates, userId)
              aiResponse = `Ticket #${ticketId} has been updated: ${Object.entries(updates)
                .map(([key, value]) => `${key} set to ${value}`)
                .join(', ')}`
            } else {
              aiResponse = 'Please specify which ticket to update (e.g., "ticket: 44")'
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
            aiResponse = `Created new ticket #${newTicket.id} with subject: ${subject}`
            break
          }
          
          case 'INFO': {
            const customerMatch = details.match(/customer:\s*(\w+)/)
            const customerId = customerMatch ? customerMatch[1] : userId
            
            const customerInfo = await crmOps.getCustomerInfo(customerId)
            aiResponse = `Customer Information:\nName: ${customerInfo.name}\nEmail: ${customerInfo.email}`
            break
          }
          
          default:
            aiResponse = "I don't understand that action. Please try rephrasing your request."
        }
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