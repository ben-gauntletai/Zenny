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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get user from auth token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(
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

    // Configure LangSmith if API key is available
    let langsmithClient
    if (langsmithApiKey) {
      Deno.env.set('LANGCHAIN_TRACING_V2', 'true')
      Deno.env.set('LANGCHAIN_ENDPOINT', 'https://api.smith.langchain.com')
      Deno.env.set('LANGCHAIN_API_KEY', langsmithApiKey)
      Deno.env.set('LANGCHAIN_PROJECT', 'zenny-autocrm')
      
      langsmithClient = new Client({
        apiUrl: "https://api.smith.langchain.com",
        apiKey: langsmithApiKey,
      })
    }

    // Initialize ChatOpenAI with temperature and callbacks
    const model = new ChatOpenAI({
      openAIApiKey: openaiApiKey,
      modelName: 'gpt-3.5-turbo',
      temperature: 0.7,
      callbacks: [{
        handleLLMStart: async (llm: any, prompts: string[]) => {
          console.log('[AutoCRM] Starting LLM call:', {
            timestamp: new Date().toISOString(),
            prompts: prompts
          })
          if (langsmithClient) {
            await langsmithClient.createRun({
              name: "autocrm_llm",
              inputs: { prompts },
              start_time: new Date(),
              run_type: "llm"
            })
          }
        },
        handleLLMEnd: async (output: any) => {
          console.log('[AutoCRM] LLM call completed:', {
            timestamp: new Date().toISOString(),
            output: output
          })
          if (langsmithClient) {
            await langsmithClient.updateRun({
              outputs: output,
              end_time: new Date(),
              status: "completed"
            })
          }
        },
        handleLLMError: async (err: Error) => {
          console.error('[AutoCRM] LLM error:', {
            timestamp: new Date().toISOString(),
            error: err.message,
            stack: err.stack
          })
          if (langsmithClient) {
            await langsmithClient.updateRun({
              error: err.message,
              end_time: new Date(),
              status: "failed"
            })
          }
        }
      }]
    })

    // Create the prompt template
    const promptTemplate = ChatPromptTemplate.fromMessages([
      ["system", `You are an AI assistant helping with CRM tasks. You must respond in a structured format that starts with an ACTION: followed by the action type and any relevant details.

        Available actions:
        1. ACTION: SEARCH - For finding tickets (e.g., "ACTION: SEARCH query: payment issue")
        2. ACTION: UPDATE - For updating tickets (e.g., "ACTION: UPDATE ticket: 44 priority: low")
        3. ACTION: CREATE - For creating tickets (e.g., "ACTION: CREATE subject: Customer reported login issue")
        4. ACTION: INFO - For getting customer info (e.g., "ACTION: INFO customer: 123")

        Keep responses concise and professional. Always start with ACTION: followed by the type.
        Available ticket statuses: open, pending, solved, closed
        Available priorities: low, normal, high, urgent`],
      ["human", `Previous conversation:
{history}

Current request: {input}`, ["history", "input"]]
    ])

    // Create the chain
    const chain = promptTemplate
      .pipe(model)
      .pipe(new StringOutputParser())

    // Initialize CRM operations
    const crmOps: CRMOperations = {
      searchTickets: async (query: string, userId: string) => {
        const { data: userInfo } = await supabaseClient
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single();

        let ticketsQuery = supabaseClient
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
        const { data: ticket } = await supabaseClient
          .from('tickets')
          .select('*')
          .eq('id', ticketId)
          .single();

        if (!ticket) throw new Error('Ticket not found');

        // Verify user has permission to update
        const { data: userInfo } = await supabaseClient
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

        const { data: updatedTicket, error } = await supabaseClient
          .from('tickets')
          .update(updates)
          .eq('id', ticketId)
          .select()
          .single();

        if (error) throw error;

        // Create notification for the update with AutoCRM as the updater name
        await notifyTicketUpdated(
          supabaseClient,
          updatedTicket,
          { id: userId, user_metadata: { ...userInfo, full_name: 'AutoCRM' } },
          previousTicket
        );

        return updatedTicket;
      },

      createTicket: async (data: any, userId: string) => {
        const { data: ticket, error } = await supabaseClient
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
        const { data, error } = await supabaseClient
          .from('profiles')
          .select('*')
          .eq('id', customerId)
          .single();

        if (error) throw error;
        return data;
      }
    };

    const { query, userId } = await req.json()

    if (!query || !userId) {
      throw new Error('Query and userId are required')
    }

    // Get or create a conversation
    const { data: existingConv, error: convError } = await supabaseClient
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
      const { data: newConv, error: createError } = await supabaseClient
        .from('autocrm_conversations')
        .insert({ user_id: userId })
        .select('id')
        .single()

      if (createError) throw createError
      conversationId = newConv.id
    }

    // Store user message
    await supabaseClient
      .from('autocrm_messages')
      .insert({
        conversation_id: conversationId,
        sender: 'user',
        content: query,
      })

    // Get conversation history
    const { data: messages, error: messagesError } = await supabaseClient
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
            
            if (ticketMatch) {
              const updates: any = {}
              if (priorityMatch) updates.priority = priorityMatch[1]
              if (statusMatch) updates.status = statusMatch[1]
              
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
    await supabaseClient
      .from('autocrm_messages')
      .insert({
        conversation_id: conversationId,
        sender: 'system',
        content: aiResponse,
      })

    // Update conversation timestamp
    await supabaseClient
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