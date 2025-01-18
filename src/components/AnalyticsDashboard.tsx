import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import '../styles/AnalyticsDashboard.css';

interface ArticleAnalytics {
  id: string;
  article_id: string;
  views: number;
  unique_views: number;
  avg_time_spent: number;
  helpful_count: number;
  not_helpful_count: number;
  last_updated: string;
  article: {
    title: string;
    category: string;
  };
}

interface AnalyticsFilters {
  category: string;
  sortBy: 'views' | 'unique_views' | 'avg_time_spent' | 'helpful_count' | 'engagement';
  order: 'asc' | 'desc';
  timeRange: 'all' | 'week' | 'month' | 'year';
}

const AnalyticsDashboard: React.FC = () => {
  const { user } = useAuth();
  const isAgent = user?.user_metadata?.role === 'agent';
  const [analytics, setAnalytics] = useState<ArticleAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<AnalyticsFilters>({
    category: '',
    sortBy: 'views',
    order: 'desc',
    timeRange: 'all'
  });
  const [categories, setCategories] = useState<string[]>([]);
  const [totalViews, setTotalViews] = useState(0);
  const [avgEngagement, setAvgEngagement] = useState(0);

  useEffect(() => {
    if (!isAgent) return;
    fetchAnalytics();
    fetchCategories();
  }, [isAgent, filters]);

  const fetchCategories = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('knowledge_base')
        .select('category')
        .not('category', 'is', null);

      if (fetchError) throw fetchError;

      const uniqueCategories = Array.from(new Set(data.map(item => item.category)));
      setCategories(uniqueCategories);
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('article_analytics')
        .select(`
          *,
          article:knowledge_base (
            title,
            category
          )
        `);

      // Apply category filter
      if (filters.category) {
        query = query.eq('article.category', filters.category);
      }

      // Apply time range filter
      if (filters.timeRange !== 'all') {
        const now = new Date();
        let startDate = new Date();
        
        switch (filters.timeRange) {
          case 'week':
            startDate.setDate(now.getDate() - 7);
            break;
          case 'month':
            startDate.setMonth(now.getMonth() - 1);
            break;
          case 'year':
            startDate.setFullYear(now.getFullYear() - 1);
            break;
        }
        
        query = query.gte('last_updated', startDate.toISOString());
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      // Calculate engagement score and sort data
      const processedData = (data || []).map(item => ({
        ...item,
        engagement: calculateEngagement(item)
      }));

      // Sort data
      const sortedData = processedData.sort((a, b) => {
        const aValue = filters.sortBy === 'engagement' ? a.engagement : a[filters.sortBy];
        const bValue = filters.sortBy === 'engagement' ? b.engagement : b[filters.sortBy];
        return filters.order === 'desc' ? bValue - aValue : aValue - bValue;
      });

      setAnalytics(sortedData);

      // Calculate totals
      const total = sortedData.reduce((sum, item) => sum + item.views, 0);
      const avgEng = sortedData.reduce((sum, item) => sum + calculateEngagement(item), 0) / sortedData.length;
      
      setTotalViews(total);
      setAvgEngagement(avgEng);
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const calculateEngagement = (article: ArticleAnalytics) => {
    const totalFeedback = article.helpful_count + article.not_helpful_count;
    const helpfulRatio = totalFeedback > 0 ? article.helpful_count / totalFeedback : 0;
    const avgTimeScore = Math.min(article.avg_time_spent / 300, 1); // Cap at 5 minutes
    return (helpfulRatio * 0.6 + avgTimeScore * 0.4) * 100; // Score out of 100
  };

  const formatTimeSpent = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    return `${Math.round(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (!isAgent) {
    return <div className="error">You don't have permission to view this page.</div>;
  }

  return (
    <div className="analytics-dashboard">
      <header className="dashboard-header">
        <h1>Knowledge Base Analytics</h1>
        <div className="dashboard-summary">
          <div className="summary-card">
            <h3>Total Views</h3>
            <p>{totalViews.toLocaleString()}</p>
          </div>
          <div className="summary-card">
            <h3>Average Engagement</h3>
            <p>{avgEngagement.toFixed(1)}%</p>
          </div>
        </div>
      </header>

      <div className="filters">
        <select
          value={filters.category}
          onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
        >
          <option value="">All Categories</option>
          {categories.map(category => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>

        <select
          value={filters.sortBy}
          onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value as any }))}
        >
          <option value="views">Sort by Views</option>
          <option value="unique_views">Sort by Unique Views</option>
          <option value="avg_time_spent">Sort by Time Spent</option>
          <option value="helpful_count">Sort by Helpful Count</option>
          <option value="engagement">Sort by Engagement</option>
        </select>

        <select
          value={filters.order}
          onChange={(e) => setFilters(prev => ({ ...prev, order: e.target.value as 'asc' | 'desc' }))}
        >
          <option value="desc">Highest First</option>
          <option value="asc">Lowest First</option>
        </select>

        <select
          value={filters.timeRange}
          onChange={(e) => setFilters(prev => ({ ...prev, timeRange: e.target.value as any }))}
        >
          <option value="all">All Time</option>
          <option value="week">Past Week</option>
          <option value="month">Past Month</option>
          <option value="year">Past Year</option>
        </select>
      </div>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <div className="loading">Loading analytics...</div>
      ) : (
        <div className="analytics-table-container">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Article</th>
                <th>Category</th>
                <th>Views</th>
                <th>Unique Views</th>
                <th>Avg. Time</th>
                <th>Helpful</th>
                <th>Not Helpful</th>
                <th>Engagement</th>
                <th>Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {analytics.map(item => (
                <tr key={item.id}>
                  <td>
                    <Link to={`/knowledge-base/${item.article_id}`}>
                      {item.article.title}
                    </Link>
                  </td>
                  <td>{item.article.category}</td>
                  <td>{item.views.toLocaleString()}</td>
                  <td>{item.unique_views.toLocaleString()}</td>
                  <td>{formatTimeSpent(item.avg_time_spent)}</td>
                  <td>{item.helpful_count}</td>
                  <td>{item.not_helpful_count}</td>
                  <td>
                    <div className="engagement-score">
                      <div 
                        className="engagement-bar"
                        style={{ width: `${calculateEngagement(item)}%` }}
                      />
                      <span>{calculateEngagement(item).toFixed(1)}%</span>
                    </div>
                  </td>
                  <td>{formatDate(item.last_updated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AnalyticsDashboard; 
