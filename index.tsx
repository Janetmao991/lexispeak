/// <reference types="vite-plugin-pwa/client" />
import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';

// Auto-adopt new deployments; re-check hourly so long-lived windows stay fresh.
const checkForUpdate = registerSW({ immediate: true });
setInterval(() => checkForUpdate(false), 60 * 60 * 1000);

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');
createRoot(container).render(<React.StrictMode><App /></React.StrictMode>);
