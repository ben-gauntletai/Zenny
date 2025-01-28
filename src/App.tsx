import React from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import NotificationProvider from './contexts/NotificationContext';
import NotificationToast from './components/NotificationToast';
import DashboardLayout from './components/DashboardLayout';
import CustomerLayout from './components/CustomerLayout';
import TicketLayout from './components/TicketLayout';
import KnowledgeBaseLayout from './components/KnowledgeBaseLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import TicketList from './pages/TicketList';
import CreateTicket from './pages/CreateTicket';
import TicketDetail from './pages/TicketDetail';
import KnowledgeBase from './pages/KnowledgeBase';
import CreateArticle from './pages/CreateArticle';
import ArticleDetail from './pages/ArticleDetail';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import CustomerList from './pages/CustomerList';
import SuspendedUsers from './pages/SuspendedUsers';
import ProtectedRoute from './components/ProtectedRoute';
import Navigation from './components/Navigation';
import './styles/App.css';
import { TicketProvider } from './contexts/TicketProvider';
import { AutoCRMProvider } from './contexts/AutoCRMContext';

const router = createBrowserRouter(
  [
    {
      path: '/login',
      element: <Login />
    },
    {
      path: '/register',
      element: <Register />
    },
    {
      path: '/',
      element: (
        <ProtectedRoute requireAgent>
          <DashboardLayout />
        </ProtectedRoute>
      ),
      children: [
        {
          path: '',
          element: <Dashboard />
        }
      ]
    },
    {
      path: '/customers',
      element: (
        <ProtectedRoute requireAgent>
          <CustomerLayout />
        </ProtectedRoute>
      ),
      children: [
        {
          path: '',
          element: <CustomerList />
        },
        {
          path: 'suspended',
          element: <SuspendedUsers />
        }
      ]
    },
    {
      path: '/tickets',
      element: (
        <ProtectedRoute>
          <TicketLayout />
        </ProtectedRoute>
      ),
      children: [
        {
          path: '',
          element: <TicketList />
        },
        {
          path: 'new',
          element: <CreateTicket />
        },
        {
          path: ':ticketId',
          element: <TicketDetail />
        }
      ]
    },
    {
      path: '/knowledge-base',
      element: (
        <ProtectedRoute>
          <KnowledgeBaseLayout />
        </ProtectedRoute>
      ),
      children: [
        {
          path: '',
          element: <KnowledgeBase />
        },
        {
          path: 'new',
          element: <CreateArticle />
        },
        {
          path: 'article/:id',
          element: <ArticleDetail />
        },
        {
          path: 'article/:id/edit',
          element: <CreateArticle />
        },
        {
          path: 'analytics',
          element: (
            <ProtectedRoute requireAgent>
              <AnalyticsDashboard />
            </ProtectedRoute>
          )
        }
      ]
    }
  ],
  {
    future: {
      v7_relativeSplatPath: true
    }
  }
);

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AutoCRMProvider>
        <NotificationProvider>
          <NotificationToast />
          <div className="app">
            <div className="app-container">
              <RouterProvider router={router} />
            </div>
          </div>
        </NotificationProvider>
      </AutoCRMProvider>
    </AuthProvider>
  );
};

export default App; 