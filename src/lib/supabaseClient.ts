import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Create a single instance of the Supabase client with real-time enabled
const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

export { supabase };
export type Tables = Database['public']['Tables'];
export type Ticket = Tables['tickets']['Row'];
export type Profile = Tables['profiles']['Row'];
export type KnowledgeBaseArticle = Tables['knowledge_base_articles']['Row']; 