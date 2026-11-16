/** The same colours and type as the web screens (src/styles/base.css and v2.css). */
export const C = {
  brand: '#6c63ff', brandL: '#7b74ff', brandD: '#4a42c8', brandDD: '#3a33a8',
  ink: '#1a1a2e', ink2: '#55556d', ink3: '#9494aa', line: '#e7e7f0', lineD: '#d0d0d8',
  tint: 'rgba(108,99,255,0.08)', tint2: 'rgba(108,99,255,0.14)', bg: '#ffffff', bg2: '#f6f6fb',
  ok: '#17a673', okD: '#0f8a5d', okBg: '#e6f7ef', gap: '#e2553f', gapBg: '#fdece8', slip: '#cf8700', slipBg: '#fff4dc',
  info: '#2f7de1', infoBg: '#e8f1fd', flame: '#ff8a1f', flameD: '#e36a00', flameBg: '#fff1e0', gold: '#f5b301', goldBg: '#fff7d9',
} as const;

export const FONT = { 400: 'DMSans_400Regular', 500: 'DMSans_500Medium', 600: 'DMSans_600SemiBold', 700: 'DMSans_700Bold', 800: 'DMSans_800ExtraBold' } as const;
export type Weight = keyof typeof FONT;

/** The two curves every transition in the web build uses. */
export const SPRING = { damping: 14, stiffness: 170, mass: 0.9 } as const;
