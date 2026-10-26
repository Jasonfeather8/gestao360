import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { installGlobalDiagnosticLogging } from './services/diagnosticLogger';
import './index.css';

installGlobalDiagnosticLogging();

createRoot(document.getElementById('root')!).render(

  <StrictMode>
    <App />
  </StrictMode>,
);
