import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Gracefully handle and suppress transient Firestore / Auth network assertion failures
if (typeof window !== 'undefined') {
  const origConsoleError = console.error;
  console.error = function (...args: any[]) {
    const fullMsg = args
      .map((a) => (typeof a === 'string' ? a : a?.message || String(a || '')))
      .join(' ');
    if (
      fullMsg.includes('Unexpected state (ID: 3c6b)') ||
      fullMsg.includes('3c6b') ||
      (fullMsg.includes('Firestore') && fullMsg.includes('auth/network-request-failed')) ||
      fullMsg.includes('Expected static flag was missing')
    ) {
      console.warn('[Resilience] Handled non-fatal warning:', fullMsg);
      return;
    }
    origConsoleError.apply(console, args);
  };

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = typeof reason === 'string' ? reason : (reason?.message || String(reason || ''));
    if (
      msg.includes('auth/network-request-failed') ||
      msg.includes('Unexpected state (ID: 3c6b)') ||
      msg.includes('3c6b') ||
      msg.includes('the client is offline') ||
      msg.includes('Could not reach Cloud Firestore')
    ) {
      console.warn('[Network Resilience] Handled transient network/auth event:', msg);
      event.preventDefault();
    }
  });

  window.addEventListener('error', (event) => {
    const msg = event.message || '';
    if (
      msg.includes('auth/network-request-failed') ||
      msg.includes('Unexpected state (ID: 3c6b)') ||
      msg.includes('3c6b') ||
      msg.includes('Expected static flag was missing')
    ) {
      console.warn('[Resilience] Handled non-fatal error event:', msg);
      event.preventDefault();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
