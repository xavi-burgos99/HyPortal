import React from 'react';
import Card from '../common/Card/Card';
import './TerminalPanel.scss';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

type TerminalPanelProps = {
  serverId: string | null;
  status: 'running' | 'stopped';
  onError?: (message: string) => void;
  getServerLog: (serverId: string | null) => string;
  refreshToken?: number;
};

const TerminalPanel: React.FC<TerminalPanelProps> = ({ serverId, status, onError, getServerLog, refreshToken }) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const termRef = React.useRef<Terminal | null>(null);
  const fitRef = React.useRef<FitAddon | null>(null);

  const copySelectionToClipboard = React.useCallback(async () => {
    const term = termRef.current;
    if (!term || !term.hasSelection?.() || !term.getSelection) return false;
    const selected = term.getSelection();
    if (!selected) return false;
    try {
      await navigator.clipboard.writeText(selected);
      return true;
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = selected;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        return true;
      } catch {
        return false;
      }
    }
  }, []);

  // Mirror user input locally so commands are visible before the server echoes anything back.
  const applyLocalEcho = React.useCallback((term: Terminal | null, data: string) => {
    if (!term || !data) return;
    if (data.includes('\x1b')) return;
    let pending = '';
    const flush = () => {
      if (pending) {
        term.write(pending);
        pending = '';
      }
    };
    for (let index = 0; index < data.length; index += 1) {
      const char = data[index];
      if (char === '\r') {
        flush();
        term.write('\r\n');
        continue;
      }
      if (char === '\b' || char === '\x7f') {
        flush();
        term.write('\b \b');
        continue;
      }
      const code = char.charCodeAt(0);
      const isPrintable = code >= 0x20 && code !== 0x7f;
      if (isPrintable || char === '\t') {
        pending += char;
      }
    }
    flush();
  }, []);

  const safeFit = React.useCallback(() => {
    const term = termRef.current;
    const fitAddon = fitRef.current;
    if (!term || !fitAddon) return;
    const core = (term as unknown as { _core?: unknown })._core;
    if (!core) return;
    try {
      fitAddon.fit();
    } catch {
      // Ignore fit failures when the terminal has been disposed or not ready.
    }
  }, []);

  const setupTerminal = React.useCallback(() => {
    if (!containerRef.current || !serverId) return;
    if (termRef.current) {
      termRef.current.dispose();
      termRef.current = null;
    }
    let term: Terminal;
    try {
      term = new Terminal({
        convertEol: true,
        fontSize: 13,
        fontFamily: 'Fira Code, Menlo, monospace',
        disableStdin: false,
        cursorBlink: true,
        backspaceSendsBackspace: true,
        theme: {
          background: '#0b1621',
          foreground: '#e5f4ff'
        },
      });
    } catch (error) {
      onError?.((error as Error)?.message ?? 'Failed to start terminal');
      return;
    }
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    const history = getServerLog(serverId);
    if (history) {
      term.write(history);
    }
    term.focus();
    const handleContextMenu = (event: MouseEvent) => {
      if (termRef.current?.hasSelection?.()) {
        event.preventDefault();
        void copySelectionToClipboard();
      }
    };
    containerRef.current.addEventListener('mousedown', () => term.focus());
    containerRef.current.addEventListener('contextmenu', handleContextMenu);
    term.attachCustomKeyEventHandler((event) => {
      if ((event.ctrlKey || event.metaKey) && event.key?.toLowerCase() === 'c' && term.hasSelection?.()) {
        void copySelectionToClipboard();
        return false;
      }
      return true;
    });
    requestAnimationFrame(() => {
      if (termRef.current === term && fitRef.current === fitAddon) {
        safeFit();
      }
    });
    term.writeln(`Attached to ${serverId}`);
    if (status !== 'running') {
      term.writeln('Server is stopped. Start it to see live output.');
    }
    termRef.current = term;
    fitRef.current = fitAddon;
    const handleResize = () => safeFit();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      containerRef.current?.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [serverId, status, safeFit, getServerLog, copySelectionToClipboard]);

  React.useEffect(() => {
    const cleanup = setupTerminal();
    return () => {
      cleanup?.();
      termRef.current?.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [setupTerminal]);

  React.useEffect(() => {
    const term = termRef.current;
    if (!term || !serverId) return;
    const disposable = term.onData((data) => {
      if (status !== 'running') return;
      applyLocalEcho(termRef.current, data);
      window.hyportal?.writeServerInput?.({ id: serverId, data });
    });
    return () => {
      disposable?.dispose();
    };
  }, [applyLocalEcho, serverId, status]);

  React.useEffect(() => {
    if (refreshToken == null) return;
    if (!termRef.current) return;
    safeFit();
    const interval = window.setInterval(() => {
      safeFit();
    }, 50);
    const stopTimeout = window.setTimeout(() => {
      window.clearInterval(interval);
    }, 3000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(stopTimeout);
    };
  }, [refreshToken, safeFit]);

  React.useEffect(() => {
    if (!serverId) return;
    const unsubscribe = window.hyportal?.onServerOutput?.((payload) => {
      if (!payload?.id || payload.id !== serverId) return;
      const term = termRef.current;
      if (!term) return;
      try {
        term.write(payload.data ?? '');
        safeFit();
      } catch (error) {
        onError?.((error as Error)?.message ?? 'Terminal output error');
      }
    });
    return () => {
      unsubscribe?.();
    };
  }, [serverId, safeFit]);

  React.useEffect(() => {
    const unsubscribe = window.hyportal?.onServerAutoInput?.((payload) => {
      if (!payload || payload.id !== serverId) return;
      applyLocalEcho(termRef.current, payload.data ?? '');
    });
    return () => {
      unsubscribe?.();
    };
  }, [applyLocalEcho, serverId]);

  return (
    <Card className="hp-terminal">
      <div className="hp-terminal__header">
        <span className="hp-terminal__dot hp-terminal__dot--red" />
        <span className="hp-terminal__dot hp-terminal__dot--amber" />
        <span className="hp-terminal__dot hp-terminal__dot--green" />
        <span className="hp-terminal__title">Server Console</span>
      </div>
      <div className="hp-terminal__body">
        <div className="hp-terminal__viewport" ref={containerRef} />
      </div>
    </Card>
  );
};

export default TerminalPanel;
