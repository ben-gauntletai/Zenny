import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { ChatOpenAI } from "npm:@langchain/openai@0.3.0"
import { 
  SystemMessage,
  HumanMessage,
  ChatPromptTemplate,
  StringOutputParser 
} from "npm:@langchain/core@0.3.33"
import { Client } from "npm:langsmith@0.1.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    const langsmithApiKey = Deno.env.get('LANGSMITH_API_KEY')
    
    if (!openaiApiKey) {
      throw new Error('OpenAI API key is missing')
    }

    // Test LangChain initialization
    console.log("Testing LangChain initialization...")
    const model = new ChatOpenAI({
      openAIApiKey: openaiApiKey,
      modelName: 'gpt-4o-mini',
      temperature: 0.7
    })

    // Test prompt template
    console.log("Testing prompt template...")
    const promptTemplate = ChatPromptTemplate.fromMessages([
      ["system", "You are a test assistant."],
      ["human", "Say hello!"]
    ])

    // Test chain creation
    console.log("Testing chain creation...")
    const chain = promptTemplate
      .pipe(model)
      .pipe(new StringOutputParser())

    // Test LangSmith if available
    if (langsmithApiKey) {
      console.log("Testing LangSmith initialization...")
      const client = new Client({
        apiUrl: "https://api.smith.langchain.com",
        apiKey: langsmithApiKey
      })

      try {
        console.log("Testing LangSmith project access...")
        await client.readProject("zenny-autocrm")
        console.log("LangSmith connection successful")
      } catch (error) {
        console.error("LangSmith connection failed:", error)
      }
    }

    // Test chain execution
    console.log("Testing chain execution...")
    const result = await chain.invoke({})
    console.log("Chain execution result:", result)

    return new Response(
      JSON.stringify({ 
        status: 'success',
        message: 'All tests completed',
        result 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ 
        status: 'error',
        message: error.message,
        details: {
          name: error.name,
          stack: error.stack,
          cause: error.cause
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
}) 