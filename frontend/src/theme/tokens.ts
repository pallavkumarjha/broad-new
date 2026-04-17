// Design tokens — Broad — The Rider's Companion
// Light theme = Paper/Ink/Amber (analog print). Dark theme = Obsidian/Amber (instrument panel).

export const colors = {
  light: {
    bg: '#F7F5F0',            // paper
    surface: '#EFECE5',       // card
    ink: '#1C1B1A',           // primary text
    inkMuted: '#595754',      // secondary text
    rule: '#D4D1C9',          // 1px borders
    amber: '#D96606',         // single accent
    success: '#2D5939',
    danger: '#A52A2A',
  },
  dark: {
    bg: '#0A0A0A',            // obsidian
    surface: '#141414',
    ink: '#FFFFFF',
    inkMuted: '#A3A3A3',
    rule: '#262626',
    amber: '#FF8C00',
    sos: '#FF3B30',
    safe: '#22C55E',
  },
};

export const space = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48,
};

export const radius = { none: 0, tiny: 2, sm: 4, full: 9999 };

export const fonts = {
  serif: 'Fraunces_400Regular',
  serifMed: 'Fraunces_500Medium',
  serifSemi: 'Fraunces_600SemiBold',
  serifBold: 'Fraunces_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMed: 'JetBrainsMono_500Medium',
};

export const type = {
  instrument: { fontFamily: fonts.serifBold, fontSize: 72, letterSpacing: -2, lineHeight: 76 },
  display: { fontFamily: fonts.serifSemi, fontSize: 40, letterSpacing: -1, lineHeight: 44 },
  h1: { fontFamily: fonts.serifSemi, fontSize: 32, letterSpacing: -0.5, lineHeight: 36 },
  h2: { fontFamily: fonts.serifMed, fontSize: 24, letterSpacing: 0, lineHeight: 28 },
  h3: { fontFamily: fonts.serifMed, fontSize: 20, letterSpacing: 0, lineHeight: 24 },
  bodyLg: { fontFamily: fonts.serif, fontSize: 18, letterSpacing: 0, lineHeight: 26 },
  body: { fontFamily: fonts.serif, fontSize: 16, letterSpacing: 0, lineHeight: 24 },
  meta: { fontFamily: fonts.mono, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' as const },
  eyebrow: { fontFamily: fonts.monoMed, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' as const },
};
