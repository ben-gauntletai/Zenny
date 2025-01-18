import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactElement;
  requireAgent?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requireAgent = false }) => {
  const { user, loading } = useAuth();
  const isAgent = user?.user_metadata?.role === 'agent';

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireAgent && !isAgent) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute; 