import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Lock, AlertCircle, Loader } from 'lucide-react';
import { Host } from '../types';
import { shell } from '../api';
import '@xterm/xterm/css/xterm.css';

interface Props {
  host: Host;
}

type State = 'connecting' | 'ready' | 'error' | 'closed';

export default function Terminal({ host }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef    = useRef<XTerm | null>(null);
  const fitRef      = useRef<FitAddon | null>(null);
  const shellIdRef  = useRef<string | null>(null);
  const unlistenRef = useRef<UnlistenFn[]>([]);
  const [status, setStatus] = useState<State>('connecting');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!containerRef.current || !host.connId) return;

    const term = new XTerm({
      theme: {
        background:   '#0f0f11',
        foreground:   '#c8c8d8',
        cursor:       '#c8c8d8',
        black:        '#1a1a26',
        red:          '#ef5350',
        green:        '#4caf50',
        yellow:       '#ffc107',
        blue:         '#2196f3',
        magenta:      '#9c27b0',
        cyan:         '#26c6da',
        white:        '#c8c8d8',
        brightBlack:  '#555566',
        brightRed:    '#ff6b6b',
        brightGreen:  '#69f0ae',
        brightYellow: '#ffd740',
        brightBlue:   '#40c4ff',
        brightMagenta:'#e040fb',
        brightCyan:   '#64ffda',
        brightWhite:  '#ffffff',
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fit.fit();

    xtermRef.current = term;
    fitRef.current   = fit;

    const connId = host.connId!;
    const cols = term.cols;
    const rows = term.rows;

    // Open shell
    shell.open(connId, cols, rows).then(async (sid) => {
      shellIdRef.current = sid;

      const unlisten: UnlistenFn[] = [];

      unlisten.push(await listen<void>(`shell:ready:${sid}`, () => {
        setStatus('ready');
      }));

      unlisten.push(await listen<string>(`shell:data:${sid}`, (ev) => {
        const bytes = Uint8Array.from(atob(ev.payload), (c) => c.charCodeAt(0));
        term.write(bytes);
      }));

      unlisten.push(await listen<void>(`shell:exit:${sid}`, () => {
        setStatus('closed');
        term.writeln('\r\n\x1b[33m[Connection closed]\x1b[0m');
      }));

      unlisten.push(await listen<string>(`shell:error:${sid}`, (ev) => {
        setStatus('error');
        setErrorMsg(ev.payload);
      }));

      unlistenRef.current = unlisten;
    }).catch((e) => {
      setStatus('error');
      setErrorMsg(String(e));
    });

    // Send keyboard input
    term.onData((data) => {
      if (!shellIdRef.current) return;
      const bytes = Array.from(new TextEncoder().encode(data));
      shell.write(shellIdRef.current, bytes).catch(console.error);
    });

    // Resize
    const ro = new ResizeObserver(() => {
      if (!fitRef.current || !shellIdRef.current) return;
      fitRef.current.fit();
      shell.resize(shellIdRef.current, term.cols, term.rows).catch(console.error);
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      unlistenRef.current.forEach((u) => u());
      if (shellIdRef.current) shell.close(shellIdRef.current).catch(() => {});
      term.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host.connId]);

  return (
    <div className="terminal">
      <div className="terminal__conn-bar">
        <span className="terminal__conn-text">
          ssh {host.config.username}@{host.config.host}:{host.config.port}
        </span>
        <span className={`terminal__conn-badge terminal__conn-badge--${status}`}>
          {status === 'connecting' && <><Loader size={10} className="spin" /> connecting</>}
          {status === 'ready'      && <><Lock size={10} /> connected</>}
          {status === 'closed'     && 'closed'}
          {status === 'error'      && <><AlertCircle size={10} /> error</>}
        </span>
      </div>

      {status === 'error' && (
        <div className="terminal__error-banner">
          <AlertCircle size={14} />
          {errorMsg}
        </div>
      )}

      <div ref={containerRef} className="terminal__body" />
    </div>
  );
}
