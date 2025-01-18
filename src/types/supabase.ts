export interface Database {
  public: {
    Tables: {
      tickets: {
        Row: {
          id: string;
          title: string;
          description: string;
          status: string;
          priority: string;
          user_id: string;
          assigned_to: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          title: string;
          description: string;
          status?: string;
          priority: string;
          user_id: string;
          assigned_to?: string | null;
        };
        Update: {
          title?: string;
          description?: string;
          status?: string;
          priority?: string;
          assigned_to?: string | null;
        };
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          name?: string | null;
        };
        Update: {
          email?: string;
          name?: string | null;
        };
      };
      knowledge_base_articles: {
        Row: {
          id: string;
          title: string;
          content: string;
          author_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          title: string;
          content: string;
          author_id: string;
        };
        Update: {
          title?: string;
          content?: string;
        };
      };
    };
  };
} 