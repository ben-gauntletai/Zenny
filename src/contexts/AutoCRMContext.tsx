import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabaseClient';

interface Message {
  id: string;
  sender: 'user' | 'system';
  content: string;      // LLM version with emails
  displayContent: string; // Display version with names
  timestamp: Date;
}

// Import the formatting functions from AutoCRMPanel
const formatFieldName = (field: string): string => {
  return field
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const formatResponseContent = (content: string): string => {
  if (!content) return 'An error occurred. Please try again.';
  
  // Handle various patterns where field names might appear
  return content
    // Handle "field_name:" pattern
    .replace(/(\w+(?:_\w+)*):(?=\s|$)/g, (match) => {
      const fieldName = match.replace(':', '');
      return formatFieldName(fieldName) + ':';
    })
    // Handle "field_name set to" pattern
    .replace(/(\w+(?:_\w+)*)\s+set\s+to\s/g, (match) => {
      const fieldName = match.replace(/\s+set\s+to\s$/, '');
      return formatFieldName(fieldName) + ' set to ';
    })
    // Handle "field_name has been" pattern
    .replace(/(\w+(?:_\w+)*)\s+has\s+been\s/g, (match) => {
      const fieldName = match.replace(/\s+has\s+been\s$/, '');
      return formatFieldName(fieldName) + ' has been ';
    })
    // Handle "Updated field_name" pattern
    .replace(/Updated\s+(\w+(?:_\w+)*)/g, (match, field) => {
      return 'Updated ' + formatFieldName(field);
    })
    // Handle "the field_name" pattern
    .replace(/the\s+(\w+(?:_\w+)*)\s/g, (match, field) => {
      return 'the ' + formatFieldName(field) + ' ';
    });
};

interface AutoCRMContextType {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  isLoadingHistory: boolean;
  hasLoadedHistory: boolean;
}

const AutoCRMContext = createContext<AutoCRMContextType | undefined>(undefined);

export function AutoCRMProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasLoadedHistory, setHasLoadedHistory] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const loadConversationHistory = async () => {
      if (!user || isLoadingHistory || hasLoadedHistory) return;

      setIsLoadingHistory(true);
      try {
        // Calculate timestamp for 6 hours ago
        const sixHoursAgo = new Date();
        sixHoursAgo.setHours(sixHoursAgo.getHours() - 6);

        // Get the most recent conversation
        const { data: conversations, error: convError } = await supabase
          .from('autocrm_conversations')
          .select('id')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1);

        if (convError) throw convError;

        const conversationId = conversations?.[0]?.id;

        if (conversationId) {
          // Load messages from this conversation from the last 6 hours
          const { data: messageHistory, error: msgError } = await supabase
            .from('autocrm_messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .gte('created_at', sixHoursAgo.toISOString())
            .order('created_at', { ascending: true });

          if (msgError) throw msgError;

          if (messageHistory) {
            setMessages(messageHistory.map(msg => {
              return {
                id: msg.id,
                sender: msg.sender,
                content: msg.content,               // Use stored content (LLM version)
                displayContent: msg.display_content, // Use stored display_content
                timestamp: new Date(msg.created_at)
              };
            }));
          }
        }
      } catch (error) {
        console.error('Error loading conversation history:', error);
      } finally {
        setIsLoadingHistory(false);
        setHasLoadedHistory(true);
      }
    };

    loadConversationHistory();
  }, [user]);

  // Periodically clean up old messages
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      setMessages(currentMessages => {
        const sixHoursAgo = new Date();
        sixHoursAgo.setHours(sixHoursAgo.getHours() - 6);
        return currentMessages.filter(msg => msg.timestamp > sixHoursAgo);
      });
    }, 5 * 60 * 1000); // Check every 5 minutes

    return () => clearInterval(cleanupInterval);
  }, []);

  return (
    <AutoCRMContext.Provider value={{
      messages,
      setMessages,
      isLoading,
      setIsLoading,
      isLoadingHistory,
      hasLoadedHistory
    }}>
      {children}
    </AutoCRMContext.Provider>
  );
}

export function useAutoCRM() {
  const context = useContext(AutoCRMContext);
  if (context === undefined) {
    throw new Error('useAutoCRM must be used within an AutoCRMProvider');
  }
  return context;
} 