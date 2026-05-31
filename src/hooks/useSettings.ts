import { useState } from 'react';
import { AppSettings, DEFAULT_SETTINGS } from '../types';

const KEY = 'foltssh:settings';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const s = localStorage.getItem(KEY);
      if (s) return { ...DEFAULT_SETTINGS, ...JSON.parse(s) };
    } catch {}
    return DEFAULT_SETTINGS;
  });

  function update(patch: Partial<AppSettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch {}
    setSettings(DEFAULT_SETTINGS);
  }

  return { settings, update, reset };
}
