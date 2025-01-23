import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

interface Article {
  id: string;
  title: string;
  content: string;
  category_id: string;
  author_id: string;
  status: 'draft' | 'published' | 'archived';
  views_count: number;
  helpful_count: number;
  not_helpful_count: number;
  created_at: string;
  updated_at: string;
  category?: {
    name: string;
  };
  author?: {
    email: string;
    full_name: string;
  };
  tags?: {
    id: string;
    name: string;
  }[];
}

interface KnowledgeBaseContextType {
  articles: Article[];
  loading: boolean;
  error: string | null;
  searchArticles: (query: string) => Promise<void>;
  refreshArticles: () => Promise<void>;
  createArticle: (article: Partial<Article>) => Promise<void>;
  updateArticle: (id: string, updates: Partial<Article>) => Promise<void>;
}

const KnowledgeBaseContext = createContext<KnowledgeBaseContextType | undefined>(undefined);

export const KnowledgeBaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArticles = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('knowledge_base_articles')
        .select(`
          *,
          category:knowledge_base_categories(name),
          tags:knowledge_base_article_tags(
            knowledge_base_tags(id, name)
          )
        `)
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform the data to match our Article interface
      const transformedData = data?.map(article => ({
        ...article,
        tags: article.tags?.map((tag: { knowledge_base_tags: { id: string; name: string } }) => tag.knowledge_base_tags)
      }));

      setArticles(transformedData || []);
    } catch (error: any) {
      console.error('Error fetching articles:', error.message);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const searchArticles = async (query: string) => {
    try {
      const { data, error } = await supabase
        .from('knowledge_base_articles')
        .select(`
          *,
          category:knowledge_base_categories(name),
          tags:knowledge_base_article_tags(
            knowledge_base_tags(id, name)
          )
        `)
        .eq('status', 'published')
        .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform the data to match our Article interface
      const transformedData = data?.map(article => ({
        ...article,
        tags: article.tags?.map((tag: { knowledge_base_tags: { id: string; name: string } }) => tag.knowledge_base_tags)
      }));

      setArticles(transformedData || []);
    } catch (error: any) {
      console.error('Error searching articles:', error.message);
      setError(error.message);
    }
  };

  const createArticle = async (article: Partial<Article>) => {
    try {
      const { error } = await supabase
        .from('knowledge_base_articles')
        .insert([article]);

      if (error) throw error;
      await fetchArticles();
    } catch (error: any) {
      console.error('Error creating article:', error.message);
      setError(error.message);
    }
  };

  const updateArticle = async (id: string, updates: Partial<Article>) => {
    try {
      const { error } = await supabase
        .from('knowledge_base_articles')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      await fetchArticles();
    } catch (error: any) {
      console.error('Error updating article:', error.message);
      setError(error.message);
    }
  };

  useEffect(() => {
    fetchArticles();
  }, []);

  const value = {
    articles,
    loading,
    error,
    searchArticles,
    refreshArticles: fetchArticles,
    createArticle,
    updateArticle,
  };

  return (
    <KnowledgeBaseContext.Provider value={value}>
      {children}
    </KnowledgeBaseContext.Provider>
  );
};

export const useKnowledgeBase = () => {
  const context = useContext(KnowledgeBaseContext);
  if (context === undefined) {
    throw new Error('useKnowledgeBase must be used within a KnowledgeBaseProvider');
  }
  return context;
}; 