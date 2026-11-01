export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Parses `#RGB` / `#RRGGBB` (the `#` is optional). Invalid input falls back to black. */
export const parseHex = (hex: string): RGB => {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
};

const channel = (v: number) => Math.min(255, Math.max(0, Math.round(v)));

/** Adds `amount` to every channel (negative darkens), clamped to 0-255. */
export const shiftColor = ({ r, g, b }: RGB, amount: number): RGB => ({
  r: channel(r + amount),
  g: channel(g + amount),
  b: channel(b + amount),
});

export const rgba = ({ r, g, b }: RGB, alpha: number) => `rgba(${r}, ${g}, ${b}, ${alpha})`;
