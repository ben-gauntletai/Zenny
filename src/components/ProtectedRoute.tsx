import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactElement;
  requireAgent?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requireAgent = false }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const isAgentOrAdmin = user?.user_metadata?.role === 'agent' || user?.user_metadata?.role === 'admin';

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Redirect regular users to tickets page when trying to access dashboard or customers
  if (!isAgentOrAdmin && (location.pathname === '/' || location.pathname.startsWith('/customers'))) {
    return <Navigate to="/tickets" replace />;
  }

  // Redirect agents and admins to dashboard when accessing tickets page directly after login
  if (isAgentOrAdmin && location.pathname === '/tickets' && location.state?.from === '/login') {
    return <Navigate to="/" replace />;
  }

  if (requireAgent && !isAgentOrAdmin) {
    return <Navigate to="/tickets" replace />;
  }

  return children;
};

export default ProtectedRoute; 