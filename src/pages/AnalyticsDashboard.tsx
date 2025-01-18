import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNotifications } from '../contexts/NotificationContext';
import '../styles/AnalyticsDashboard.css';

interface DatabaseArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  author_id: string;
  created_at: string;
  updated_at: string;
  article_views?: { count: number };
  article_feedback?: { score: number };
}

interface ArticleAnalytics extends Omit<DatabaseArticle, 'article_views' | 'article_feedback'> {
  views: number;
  feedback_score: number;
  engagement: number;
}

interface FilterState {
  category: string;
  sortBy: 'views' | 'feedback_score' | 'engagement';
  order: 'asc' | 'desc';
}

const AnalyticsDashboard: React.FC = () => {
  const [categories, setCategories] = useState<string[]>([]);
  const [articles, setArticles] = useState<ArticleAnalytics[]>([]);
  const [totalViews, setTotalViews] = useState(0);
  const [avgEngagement, setAvgEngagement] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<FilterState>({
    category: '',
    sortBy: 'views',
    order: 'desc'
  });

  useEffect(() => {
    fetchCategories();
    fetchArticles();
  }, [filters]);

  const fetchCategories = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('knowledge_base_articles')
        .select('category');

      if (fetchError) throw fetchError;

      const uniqueCategories = Array.from(
        new Set((data as DatabaseArticle[]).map(item => item.category))
      ).filter(Boolean) as string[];
      
      setCategories(uniqueCategories);
    } catch (err) {
      console.error('Error fetching categories:', err);
      setError('Failed to load categories');
    }
  };

  const calculateEngagement = (views: number, feedbackScore: number): number => {
    // Simple engagement score calculation
    return (views * 0.6) + (feedbackScore * 0.4);
  };

  const fetchArticles = async () => {
    try {
      setLoading(true);
      setError('');

      let query = supabase
        .from('knowledge_base_articles')
        .select(`
          *,
          article_views (count),
          article_feedback (score)
        `);

      if (filters.category) {
        query = query.eq('category', filters.category);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      // Process and format the data
      const processedData: ArticleAnalytics[] = (data as DatabaseArticle[] || []).map(item => {
        const views = item.article_views?.count || 0;
        const feedbackScore = item.article_feedback?.score || 0;
        
        return {
          id: item.id,
          title: item.title,
          content: item.content,
          category: item.category,
          author_id: item.author_id,
          created_at: item.created_at,
          updated_at: item.updated_at,
          views,
          feedback_score: feedbackScore,
          engagement: calculateEngagement(views, feedbackScore)
        };
      });

      // Sort data
      const sortedData = processedData.sort((a, b) => {
        const aValue = filters.sortBy === 'engagement' ? a.engagement : a[filters.sortBy];
        const bValue = filters.sortBy === 'engagement' ? b.engagement : b[filters.sortBy];
        return filters.order === 'desc' ? bValue - aValue : aValue - bValue;
      });

      // Calculate totals
      const total = sortedData.reduce((sum, item) => sum + item.views, 0);
      const avgEng = sortedData.reduce((sum, item) => sum + item.engagement, 0) / sortedData.length;
      
      setTotalViews(total);
      setAvgEngagement(avgEng);
      setArticles(sortedData);
    } catch (err) {
      console.error('Error fetching articles:', err);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading analytics...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="analytics-dashboard">
      {/* ... rest of the JSX ... */}
    </div>
  );
};

export default AnalyticsDashboard; 