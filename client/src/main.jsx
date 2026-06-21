import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import Board from './pages/Board.jsx';
import Setup from './pages/Setup.jsx';
import './styles/global.css';

const router = createBrowserRouter([
  { path: '/', element: <Board /> },
  { path: '/setup', element: <Setup /> },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
