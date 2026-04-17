import React, { createContext, useContext, useEffect, useState } from 'react';
import { storage } from '../lib/api';

const KEY = 'broad_settings_v1';

export type Settings = {
  bgLocation: boolean;
  crashDetect: boolean;
  shareLiveLocation: boolean;
  haptics: boolean;
};

const DEFAULTS: Settings = {
  bgLocation: true,
  crashDetect: true,
  shareLiveLocation: false,
  haptics: true,
};

const Ctx = createContext<{
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
} | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    (async () => {
      const raw = await storage.getItem(KEY);
      if (raw) {
        try { setSettings({ ...DEFAULTS, ...JSON.parse(raw) }); } catch {}
      }
    })();
  }, []);

  const update = async (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await storage.setItem(KEY, JSON.stringify(next));
  };

  return <Ctx.Provider value={{ settings, update }}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSettings must be used inside SettingsProvider');
  return v;
}
