// Mirrors the web app's Tailwind "luxury" palette and fonts (index.html).
export const colors = {
  gold: '#D4AF37',
  goldLight: '#F3E5AB',
  goldDark: '#996515',
  black: '#0A0A0A',
  surface: '#121212',
  border: '#1E1E1E',
  white: '#FFFFFF',
  muted: 'rgba(255, 255, 255, 0.5)',
  faint: 'rgba(255, 255, 255, 0.1)',
};

export const goldGradient = [colors.gold, colors.goldLight, colors.goldDark] as const;

export const fonts = {
  serif: 'PlayfairDisplay_700Bold',
  serifBlack: 'PlayfairDisplay_900Black',
  sans: 'Manrope_400Regular',
  sansLight: 'Manrope_300Light',
  sansBold: 'Manrope_700Bold',
};
