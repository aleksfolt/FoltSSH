import { AppSettings } from '../types';
import { TERMINAL_THEMES } from '../terminalThemes';

const FONT_FAMILIES = [
  { label: 'JetBrains Mono', value: 'JetBrains Mono' },
  { label: 'Fira Code',      value: 'Fira Code' },
  { label: 'Cascadia Code',  value: 'Cascadia Code' },
  { label: 'Menlo',          value: 'Menlo' },
  { label: 'Courier New',    value: 'Courier New' },
  { label: 'System mono',    value: 'monospace' },
];

interface Props {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  onReset:  () => void;
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      className={`settings__toggle${on ? ' settings__toggle--on' : ''}`}
      onClick={onToggle}
    >
      <span className="settings__toggle-thumb" />
    </button>
  );
}

export default function SettingsPanel({ settings, onChange, onReset }: Props) {
  return (
    <div className="settings">
      <div className="settings__header">
        <span className="settings__title">Settings</span>
        <button className="settings__reset" onClick={onReset}>Reset defaults</button>
      </div>

      <div className="settings__body">

        {/* ── Terminal ─────────────────────────────── */}
        <section className="settings__section">
          <h3 className="settings__section-title">Terminal</h3>

          <div className="settings__row">
            <label className="settings__label">Theme</label>
            <div className="settings__theme-grid">
              {TERMINAL_THEMES.map((t) => (
                <button
                  key={t.name}
                  className={`settings__theme-chip${settings.terminalTheme === t.name ? ' settings__theme-chip--active' : ''}`}
                  onClick={() => onChange({ terminalTheme: t.name })}
                  style={{ '--chip-bg': t.colors.background as string } as React.CSSProperties}
                  title={t.label}
                >
                  <span className="settings__theme-dot" style={{ background: t.colors.green as string }} />
                  <span className="settings__theme-dot" style={{ background: t.colors.blue as string }} />
                  <span className="settings__theme-dot" style={{ background: t.colors.red as string }} />
                  <span className="settings__theme-name">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="settings__row">
            <label className="settings__label">Font size</label>
            <div className="settings__slider-wrap">
              <input type="range" min={10} max={24} step={1}
                value={settings.fontSize}
                onChange={(e) => onChange({ fontSize: +e.target.value })} />
              <span className="settings__slider-val">{settings.fontSize}px</span>
            </div>
          </div>

          <div className="settings__row">
            <label className="settings__label">Font family</label>
            <select className="settings__select"
              value={settings.fontFamily}
              onChange={(e) => onChange({ fontFamily: e.target.value })}>
              {FONT_FAMILIES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>

          <div className="settings__row">
            <label className="settings__label">Cursor style</label>
            <div className="settings__radio-group">
              {(['block', 'underline', 'bar'] as const).map((cs) => (
                <button key={cs}
                  className={`settings__radio${settings.cursorStyle === cs ? ' settings__radio--active' : ''}`}
                  onClick={() => onChange({ cursorStyle: cs })}>
                  {cs.charAt(0).toUpperCase() + cs.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="settings__row">
            <label className="settings__label">Cursor blink</label>
            <Toggle on={settings.cursorBlink} onToggle={() => onChange({ cursorBlink: !settings.cursorBlink })} />
          </div>

          <div className="settings__row">
            <label className="settings__label">Copy on select</label>
            <Toggle on={settings.copyOnSelect} onToggle={() => onChange({ copyOnSelect: !settings.copyOnSelect })} />
          </div>

          <div className="settings__row">
            <label className="settings__label">Scrollback lines</label>
            <input type="number" min={500} max={50000} step={500}
              className="settings__input settings__input--sm"
              value={settings.scrollback}
              onChange={(e) => onChange({ scrollback: Math.max(500, +e.target.value) })} />
          </div>
        </section>

        {/* ── Connections ──────────────────────────── */}
        <section className="settings__section">
          <h3 className="settings__section-title">Connections</h3>

          <div className="settings__row">
            <label className="settings__label">Default port</label>
            <input type="number" min={1} max={65535}
              className="settings__input settings__input--sm"
              value={settings.defaultPort}
              onChange={(e) => onChange({ defaultPort: e.target.value })} />
          </div>

          <div className="settings__row">
            <label className="settings__label">Default username</label>
            <input type="text" className="settings__input" placeholder="root"
              value={settings.defaultUsername}
              onChange={(e) => onChange({ defaultUsername: e.target.value })} />
          </div>

          <div className="settings__row">
            <label className="settings__label">Disconnect on<br/>last tab close</label>
            <Toggle on={settings.disconnectOnTabClose}
              onToggle={() => onChange({ disconnectOnTabClose: !settings.disconnectOnTabClose })} />
          </div>

          <div className="settings__row">
            <label className="settings__label">Auto-reconnect</label>
            <Toggle on={settings.autoReconnect}
              onToggle={() => onChange({ autoReconnect: !settings.autoReconnect })} />
          </div>

          {settings.autoReconnect && (
            <div className="settings__row">
              <label className="settings__label">Reconnect delay</label>
              <div className="settings__slider-wrap">
                <input type="range" min={1} max={30} step={1}
                  value={settings.reconnectDelay}
                  onChange={(e) => onChange({ reconnectDelay: +e.target.value })} />
                <span className="settings__slider-val">{settings.reconnectDelay}s</span>
              </div>
            </div>
          )}
        </section>

        {/* ── Appearance ───────────────────────────── */}
        <section className="settings__section">
          <h3 className="settings__section-title">Appearance</h3>

          <div className="settings__row">
            <label className="settings__label">Terminal opacity</label>
            <div className="settings__slider-wrap">
              <input type="range" min={40} max={100} step={5}
                value={Math.round(settings.terminalOpacity * 100)}
                onChange={(e) => onChange({ terminalOpacity: +e.target.value / 100 })} />
              <span className="settings__slider-val">{Math.round(settings.terminalOpacity * 100)}%</span>
            </div>
          </div>
        </section>

        <p className="settings__version">FoltSSH v0.1.0 · Tauri + React</p>
      </div>
    </div>
  );
}
