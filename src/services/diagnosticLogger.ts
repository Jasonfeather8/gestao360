type DiagnosticLevel = 'info' | 'warn' | 'error';

type DiagnosticEntry = {
  timestamp: string;
  level: DiagnosticLevel;
  scope: string;
  message: string;
  details?: unknown;
};

const STORAGE_KEY = 'gestao360_diagnostic_logs';
const MAX_ENTRIES = 100;

function serialize(details: unknown) {
  if (details instanceof Error) return { name: details.name, message: details.message, stack: details.stack };
  try {
    return JSON.parse(JSON.stringify(details, (_key, value) => value instanceof Error
      ? { name: value.name, message: value.message, stack: value.stack }
      : value));
  } catch {
    return String(details);
  }
}

export const diagnosticLogger = {
  log(level: DiagnosticLevel, scope: string, message: string, details?: unknown) {
    const entry: DiagnosticEntry = {
      timestamp: new Date().toISOString(),
      level,
      scope,
      message,
      details: details === undefined ? undefined : serialize(details),
    };

    try {
      const previous = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as DiagnosticEntry[];
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...previous, entry].slice(-MAX_ENTRIES)));
    } catch {
      // Logging must never interrupt the application flow.
    }

    const output = `[${scope}] ${message}`;
    if (level === 'error') console.error(output, entry.details ?? '');
    else if (level === 'warn') console.warn(output, entry.details ?? '');
    else console.info(output, entry.details ?? '');
  },

  info(scope: string, message: string, details?: unknown) {
    this.log('info', scope, message, details);
  },

  warn(scope: string, message: string, details?: unknown) {
    this.log('warn', scope, message, details);
  },

  error(scope: string, message: string, details?: unknown) {
    this.log('error', scope, message, details);
  },

  getEntries(): DiagnosticEntry[] {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as DiagnosticEntry[];
    } catch {
      return [];
    }
  },
};

export function installGlobalDiagnosticLogging() {
  window.addEventListener('error', (event) => {
    diagnosticLogger.error('global-error', event.message || 'Erro não tratado na janela', {
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
      error: event.error,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    diagnosticLogger.error('unhandled-rejection', 'Promise rejeitada sem tratamento', event.reason);
  });

  diagnosticLogger.info('diagnostics', 'Diagnóstico global iniciado', { userAgent: navigator.userAgent });
}

export const DIAGNOSTIC_STORAGE_KEY = STORAGE_KEY;
