import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';

/** Loads latest data when the user opens or navigates to a route (no polling). */
export const RouteDataLoader: React.FC = () => {
  const { auth, checkingAuth, refreshForRoute } = useApp();
  const location = useLocation();
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (checkingAuth || !auth.isAuthenticated || location.pathname === '/login') return;
    if (lastPathRef.current === location.pathname) return;

    lastPathRef.current = location.pathname;
    refreshForRoute(location.pathname, true);
  }, [checkingAuth, auth.isAuthenticated, location.pathname, refreshForRoute]);

  return null;
};
