import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, redirect } from 'react-router-dom';

import Board from './pages/Board.jsx';
import Setup from './pages/Setup.jsx';
import { resolveConfig } from './config.js';
import './styles/global.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Board />,
    // 저장된/공유된 설정이 전혀 없으면 보드 렌더 전에 바로 설정 화면으로
    loader: () => (resolveConfig() ? null : redirect('/setup')),
  },
  { path: '/setup', element: <Setup /> },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
