import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

interface Article {
  id: string;
  title: string;
  content: string;
  category: string;
  author: string;
  created_at: string;
  updated_at: string;
  published: boolean;
  views: number;
  helpful_count: number;
  tags?: string[];
}

interface KnowledgeBaseContextType {
  articles: Article[];
  loading: boolean;
  searchArticles: (query: string) => Promise<void>;
  refreshArticles: () => Promise<void>;
  createArticle: (article: Partial<Article>) => Promise<void>;
  updateArticle: (id: string, updates: Partial<Article>) => Promise<void>;
  incrementViews: (id: string) => Promise<void>;
  markHelpful: (id: string) => Promise<void>;
}

const KnowledgeBaseContext = createContext<KnowledgeBaseContextType | undefined>(undefined);

export const KnowledgeBaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchArticles = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setArticles(data || []);
    } catch (error: any) {
      console.error('Error fetching articles:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const searchArticles = async (query: string) => {
    try {
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setArticles(data || []);
    } catch (error: any) {
      console.error('Error searching articles:', error.message);
    }
  };

  const createArticle = async (article: Partial<Article>) => {
    try {
      const { error } = await supabase
        .from('articles')
        .insert([article]);

      if (error) throw error;
      await fetchArticles();
    } catch (error: any) {
      console.error('Error creating article:', error.message);
    }
  };

  const updateArticle = async (id: string, updates: Partial<Article>) => {
    try {
      const { error } = await supabase
        .from('articles')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      await fetchArticles();
    } catch (error: any) {
      console.error('Error updating article:', error.message);
    }
  };

  const incrementViews = async (id: string) => {
    try {
      const { error } = await supabase.rpc('increment_article_views', { article_id: id });
      if (error) throw error;
      await fetchArticles();
    } catch (error: any) {
      console.error('Error incrementing views:', error.message);
    }
  };

  const markHelpful = async (id: string) => {
    try {
      const { error } = await supabase.rpc('increment_article_helpful', { article_id: id });
      if (error) throw error;
      await fetchArticles();
    } catch (error: any) {
      console.error('Error marking article as helpful:', error.message);
    }
  };

  useEffect(() => {
    fetchArticles();
  }, []);

  return (
    <KnowledgeBaseContext.Provider
      value={{
        articles,
        loading,
        searchArticles,
        refreshArticles: fetchArticles,
        createArticle,
        updateArticle,
        incrementViews,
        markHelpful
      }}
    >
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