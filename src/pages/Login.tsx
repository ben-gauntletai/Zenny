import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { FiMail, FiLock, FiEye, FiEyeOff, FiAlertCircle, FiCheckCircle } from 'react-icons/fi';
import { motion } from 'framer-motion';
import '../styles/Login.css';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Get redirect path from location state or default to dashboard
  const from = location.state?.from?.pathname || '/';
  const [successMessage, setSuccessMessage] = useState<string | undefined>(
    location.state?.message
  );

  useEffect(() => {
    // Check if there's a saved email in localStorage
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  useEffect(() => {
    // Clear success message after 5 seconds
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(undefined);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      setEmailError('Email is required');
      return false;
    }
    if (!emailRegex.test(email)) {
      setEmailError('Please enter a valid email address');
      return false;
    }
    setEmailError('');
    return true;
  };

  const validatePassword = (password: string): boolean => {
    if (!password) {
      setPasswordError('Password is required');
      return false;
    }
    if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return false;
    }
    setPasswordError('');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate inputs
    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);

    if (!isEmailValid || !isPasswordValid) {
      return;
    }

    try {
      setIsLoading(true);
      await signIn(email, password);
      
      // Handle "Remember Me"
      if (rememberMe) {
        localStorage.setItem('rememberedEmail', email);
      } else {
        localStorage.removeItem('rememberedEmail');
      }

      // Navigate to the intended page
      navigate(from, { 
        replace: true,
        state: { from: '/login' }
      });
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Failed to sign in. Please check your credentials.');
      setIsLoading(false);
    }
  };

  const handleQuickLogin = async (email: string) => {
    try {
      setIsLoading(true);
      setError('');
      // Use the correct password for each user
      console.log('Environment variable check:', process.env.REACT_APP_QUICK_ACCESS_PASSWORD);
      const password = process.env.REACT_APP_QUICK_ACCESS_PASSWORD;
      if (!password) {
        throw new Error('Quick access password not configured');
      }
      await signIn(email, password);
      navigate(from, { 
        replace: true,
        state: { from: '/login' }
      });
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Failed to sign in. Please check your credentials.');
      setIsLoading(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="login-container">
      <div className="quick-login-section">
        <p className="quick-login-title">Quick Access</p>
        <div className="quick-login-buttons">
          <button
            onClick={() => handleQuickLogin('ttttsmurf1@gmail.com')}
            className="quick-login-button admin"
            disabled={isLoading}
          >
            Sign in as Admin
          </button>
          <button
            onClick={() => handleQuickLogin('ttttsmurf4@gmail.com')}
            className="quick-login-button agent"
            disabled={isLoading}
          >
            Sign in as Agent
          </button>
          <button
            onClick={() => handleQuickLogin('ttttsmurf2@gmail.com')}
            className="quick-login-button user"
            disabled={isLoading}
          >
            Sign in as User
          </button>
        </div>
      </div>

      <motion.div 
        className="login-box"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="login-header">
          <h1 className="login-logo">Zenny</h1>
          <p className="login-subtitle">Sign in to your account</p>
        </div>

        {successMessage && (
          <motion.div 
            className="success-message"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <FiCheckCircle />
            {successMessage}
          </motion.div>
        )}

        {error && (
          <motion.div 
            className="error-message"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <FiAlertCircle />
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email address</label>
            <div className="input-wrapper">
              <FiMail className="input-icon" />
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) validateEmail(e.target.value);
                }}
                onBlur={(e) => validateEmail(e.target.value)}
                placeholder="Enter your email"
                autoComplete="email"
                className={emailError ? 'error' : ''}
              />
            </div>
            {emailError && <span className="field-error">{emailError}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-wrapper">
              <FiLock className="input-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) validatePassword(e.target.value);
                }}
                onBlur={(e) => validatePassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                className={passwordError ? 'error' : ''}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={togglePasswordVisibility}
                tabIndex={-1}
              >
                {showPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
            {passwordError && <span className="field-error">{passwordError}</span>}
          </div>

          <div className="form-options">
            <label className="remember-me">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Remember me</span>
            </label>
          </div>

          <button
            type="submit"
            className="login-button"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="loading-spinner"></span>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <div className="register-link">
          <span>Don't have an account?</span>
          {' '}
          <Link to="/register">Create an account</Link>
        </div>
      </motion.div>
    </div>
  );
};

export default Login; 