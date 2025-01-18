import { useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

const useArticleAnalytics = (articleId: string) => {
  const { user } = useAuth();
  const startTime = useRef(Date.now());
  const sessionId = useRef(uuidv4());

  useEffect(() => {
    const trackView = async () => {
      try {
        await supabase
          .from('article_views')
          .insert({
            article_id: articleId,
            user_id: user?.id,
            session_id: sessionId.current
          });
      } catch (err) {
        console.error('Error tracking view:', err);
      }
    };

    trackView();

    return () => {
      const endTime = Date.now();
      const timeSpent = Math.round((endTime - startTime.current) / 1000); // Convert to seconds

      // Only track time if the user spent more than 5 seconds on the article
      if (timeSpent >= 5) {
        supabase
          .from('article_views')
          .update({ time_spent: timeSpent })
          .eq('session_id', sessionId.current)
          .then(({ error }) => {
            if (error) {
              console.error('Error updating time spent:', error);
            }
          });
      }
    };
  }, [articleId, user]);
};

export default useArticleAnalytics; 
