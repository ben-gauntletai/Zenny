import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getInitials, getProfileColor } from '../utils/profileUtils';
import { supabase } from '../lib/supabaseClient';
import '../styles/Navigation.css';

const DefaultUserIcon = () => (
  <svg 
    viewBox="0 0 24 24" 
    fill="currentColor" 
    style={{ width: '16px', height: '16px' }}
  >
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
  </svg>
);

const Navigation: React.FC = () => {
  const { user, signOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [profile, setProfile] = useState<{ full_name: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const isAgentOrAdmin = user?.user_metadata?.role === 'agent' || user?.user_metadata?.role === 'admin';
  
  console.log('Navigation Debug:', {
    user_metadata: user?.user_metadata,
    role: user?.user_metadata?.role,
    isAgentOrAdmin
  });

  useEffect(() => {
    const fetchProfile = async () => {
      if (user?.id) {
        const { data } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();
        
        if (data) {
          setProfile(data);
        }
      }
    };

    fetchProfile();
  }, [user?.id]);

  const initials = getInitials(profile?.full_name || '');
  const profileColor = getProfileColor(user?.email || '');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      setIsMenuOpen(false);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <nav className="navigation">
      <div className="nav-content">
        <div className="nav-brand">
          <Link to={isAgentOrAdmin ? "/" : "/tickets"}>Zenny</Link>
        </div>
        <div className="nav-links">
          {isAgentOrAdmin && (
            <>
              <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
                Dashboard
              </Link>
            </>
          )}
          <Link to="/tickets" className={location.pathname.startsWith('/tickets') ? 'active' : ''}>
            Tickets
          </Link>
          <Link to="/knowledge-base" className={location.pathname.startsWith('/knowledge-base') ? 'active' : ''}>
            Knowledge Base
          </Link>
        </div>
        <div className="nav-user" ref={menuRef}>
          <button
            className="profile-button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Open profile menu"
          >
            <div 
              className="profile-icon" 
              style={{ 
                backgroundColor: profileColor,
                color: 'white',
                fontSize: '14px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '50%'
              }}
            >
              {initials || <DefaultUserIcon />}
            </div>
            <div className="status-indicator"></div>
          </button>

          {isMenuOpen && (
            <div className="profile-dropdown">
              <div className="profile-header">
                <div className="profile-info">
                  <span className="profile-name">{profile?.full_name || 'Anonymous User'}</span>
                  <span className="profile-email">{user?.email || ''}</span>
                </div>
              </div>
              <div className="profile-menu-footer">
                <button className="menu-item sign-out" onClick={handleSignOut}>
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navigation; 