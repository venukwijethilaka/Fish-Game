// [AI-ASSISTED: Codex, 2026-10-21] Application entry. No AI-generated video material.
import React from 'react';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { ReefProvider, useReef } from './context';
import { Loading } from './components';
import { Layout } from './layout';
import { AuthPage } from './pages/auth';
import { Dashboard, Leaderboard } from './pages/dashboard';
import { GamePage } from './pages/game';
import { Profile } from './pages/profile';
import './styles.css';
function Guard() {
  const { loading, user } = useReef();
  const location = useLocation();
  if (loading)
    return (
      <div className="boot-screen">
        <Loading />
      </div>
    );
  return user ? <Outlet /> : <Navigate to="/login" state={{ from: location.pathname }} replace />;
}
function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route path="/register" element={<AuthPage register />} />
      <Route element={<Guard />}>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/game/:gameId" element={<GamePage />} />
          <Route path="/game/:gameId/result" element={<GamePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
const appRoot = import.meta.hot?.data.root ?? ReactDOM.createRoot(document.getElementById('root')!);
if (import.meta.hot) import.meta.hot.data.root = appRoot;
appRoot.render(
  <React.StrictMode>
    <BrowserRouter>
      <ReefProvider>
        <App />
      </ReefProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
