import type { ITheme } from '@xterm/xterm';

export interface TerminalTheme {
  name:   string;
  label:  string;
  colors: ITheme;
}

function rgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const THEMES_RAW: Record<string, { label: string; bg: string; colors: Omit<ITheme, 'background'> }> = {
  default: {
    label: 'FoltSSH Dark',
    bg: '#0f0f11',
    colors: {
      foreground:    '#c8c8d8', cursor: '#c8c8d8',
      black:         '#1a1a26', red:           '#ef5350',
      green:         '#4caf50', yellow:        '#ffc107',
      blue:          '#2196f3', magenta:       '#9c27b0',
      cyan:          '#26c6da', white:         '#c8c8d8',
      brightBlack:   '#555566', brightRed:     '#ff6b6b',
      brightGreen:   '#69f0ae', brightYellow:  '#ffd740',
      brightBlue:    '#40c4ff', brightMagenta: '#e040fb',
      brightCyan:    '#64ffda', brightWhite:   '#ffffff',
    },
  },
  dracula: {
    label: 'Dracula',
    bg: '#282a36',
    colors: {
      foreground:    '#f8f8f2', cursor: '#f8f8f2',
      black:         '#21222c', red:           '#ff5555',
      green:         '#50fa7b', yellow:        '#f1fa8c',
      blue:          '#bd93f9', magenta:       '#ff79c6',
      cyan:          '#8be9fd', white:         '#f8f8f2',
      brightBlack:   '#6272a4', brightRed:     '#ff6e6e',
      brightGreen:   '#69ff94', brightYellow:  '#ffffa5',
      brightBlue:    '#d6acff', brightMagenta: '#ff92df',
      brightCyan:    '#a4ffff', brightWhite:   '#ffffff',
    },
  },
  onedark: {
    label: 'One Dark',
    bg: '#282c34',
    colors: {
      foreground:    '#abb2bf', cursor: '#528bff',
      black:         '#282c34', red:           '#e06c75',
      green:         '#98c379', yellow:        '#e5c07b',
      blue:          '#61afef', magenta:       '#c678dd',
      cyan:          '#56b6c2', white:         '#abb2bf',
      brightBlack:   '#545862', brightRed:     '#e06c75',
      brightGreen:   '#98c379', brightYellow:  '#e5c07b',
      brightBlue:    '#61afef', brightMagenta: '#c678dd',
      brightCyan:    '#56b6c2', brightWhite:   '#c8ccd4',
    },
  },
  nord: {
    label: 'Nord',
    bg: '#2e3440',
    colors: {
      foreground:    '#d8dee9', cursor: '#d8dee9',
      black:         '#3b4252', red:           '#bf616a',
      green:         '#a3be8c', yellow:        '#ebcb8b',
      blue:          '#81a1c1', magenta:       '#b48ead',
      cyan:          '#88c0d0', white:         '#e5e9f0',
      brightBlack:   '#4c566a', brightRed:     '#bf616a',
      brightGreen:   '#a3be8c', brightYellow:  '#ebcb8b',
      brightBlue:    '#81a1c1', brightMagenta: '#b48ead',
      brightCyan:    '#8fbcbb', brightWhite:   '#eceff4',
    },
  },
  solarized: {
    label: 'Solarized Dark',
    bg: '#002b36',
    colors: {
      foreground:    '#839496', cursor: '#839496',
      black:         '#073642', red:           '#dc322f',
      green:         '#859900', yellow:        '#b58900',
      blue:          '#268bd2', magenta:       '#d33682',
      cyan:          '#2aa198', white:         '#eee8d5',
      brightBlack:   '#002b36', brightRed:     '#cb4b16',
      brightGreen:   '#586e75', brightYellow:  '#657b83',
      brightBlue:    '#839496', brightMagenta: '#6c71c4',
      brightCyan:    '#93a1a1', brightWhite:   '#fdf6e3',
    },
  },
  gruvbox: {
    label: 'Gruvbox Dark',
    bg: '#282828',
    colors: {
      foreground:    '#ebdbb2', cursor: '#ebdbb2',
      black:         '#282828', red:           '#cc241d',
      green:         '#98971a', yellow:        '#d79921',
      blue:          '#458588', magenta:       '#b16286',
      cyan:          '#689d6a', white:         '#a89984',
      brightBlack:   '#928374', brightRed:     '#fb4934',
      brightGreen:   '#b8bb26', brightYellow:  '#fabd2f',
      brightBlue:    '#83a598', brightMagenta: '#d3869b',
      brightCyan:    '#8ec07c', brightWhite:   '#ebdbb2',
    },
  },
};

export const TERMINAL_THEMES: TerminalTheme[] = Object.entries(THEMES_RAW).map(
  ([name, { label, bg, colors }]) => ({ name, label, colors: { ...colors, background: bg } }),
);

export function buildTheme(themeName: string, opacity: number): ITheme {
  const t = TERMINAL_THEMES.find((t) => t.name === themeName) ?? TERMINAL_THEMES[0];
  const bg = t.colors.background as string;
  return { ...t.colors, background: opacity < 1 ? rgba(bg.replace(/^rgba?\([^)]+\)$/, '#0f0f11'), opacity) : bg };
}
