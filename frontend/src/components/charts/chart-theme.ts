import { useEffect, useState } from 'react';

/**
 * Chart palette and chrome.
 *
 * The eight categorical slots are a validated set: in fixed order they clear
 * the CVD-separation, lightness-band and chroma gates for adjacent pairs in
 * both modes. Do not reorder them and do not add a ninth — fold extra series
 * into "Other" or split the chart instead.
 *
 * Light slots 3, 4 and 5 sit below 3:1 on a white card, so any chart using
 * them must carry direct labels or a table view. Dark slots all clear 3:1.
 */

export const SERIES_LIGHT = [
  '#2a78d6', // 1 blue
  '#eb6834', // 2 orange
  '#1baf7a', // 3 aqua
  '#eda100', // 4 yellow
  '#e87ba4', // 5 magenta
  '#008300', // 6 green
  '#6250d6', // 7 violet
  '#e34948', // 8 red
] as const;

export const SERIES_DARK = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767',
] as const;

/**
 * Status colours are reserved for state and never reused as a series. Always
 * pair with an icon or a label — `warning` and `serious` are sub-3:1 on a
 * light surface by design.
 */
export const STATUS_LIGHT = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const;

export const STATUS_DARK = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const;

export interface ChartTheme {
  dark: boolean;
  series: readonly string[];
  status: typeof STATUS_LIGHT;
  grid: string;
  axis: string;
  tick: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  /** Fill for "equal parts" slices the palette has no slot for. */
  neutral: string;
}

const LIGHT: ChartTheme = {
  dark: false,
  series: SERIES_LIGHT,
  status: STATUS_LIGHT,
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  tick: '#898781',
  tooltipBg: '#ffffff',
  tooltipBorder: 'rgba(11,11,11,0.10)',
  tooltipText: '#0b0b0b',
  neutral: '#c3c2b7',
};

const DARK: ChartTheme = {
  dark: true,
  series: SERIES_DARK,
  status: STATUS_DARK,
  grid: '#2c2c2a',
  axis: '#383835',
  tick: '#898781',
  tooltipBg: '#1a1a19',
  tooltipBorder: 'rgba(255,255,255,0.10)',
  tooltipText: '#f0efec',
  neutral: '#383835',
};

/** Stable colour for an entity at a known position, never by rank. */
export function seriesColor(theme: ChartTheme, index: number): string {
  return theme.series[index % theme.series.length];
}

/**
 * The theme lives on the `<html>` class list (`useTheme` writes it there and
 * also reacts to the OS setting), so charts follow the same signal rather than
 * keeping a second copy of the preference.
 */
function currentIsDark(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

export function useChartTheme(): ChartTheme {
  const [dark, setDark] = useState(currentIsDark);

  useEffect(() => {
    setDark(currentIsDark());
    const observer = new MutationObserver(() => setDark(currentIsDark()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  return dark ? DARK : LIGHT;
}
