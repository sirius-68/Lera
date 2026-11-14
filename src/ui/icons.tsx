/** One icon set, drawn on a 24-unit grid with a 2-unit round stroke. */
const PATHS: Record<string, string> = {
  home: 'M4 11.2 12 4l8 7.2V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9v5.5H5.5A1.5 1.5 0 0 1 4 19z',
  book: 'M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5zM5 20.5A2.5 2.5 0 0 0 7.5 21H19M9 7.5h6',
  pencil: 'M4 20l1-4.5L16.5 4a2.1 2.1 0 0 1 3 3L8 18.5zM14.5 6l3 3',
  chart: 'M5 20V11M12 20V4M19 20v-6',
  gear: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.5-2.4 1a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4L9.6 5A7.6 7.6 0 0 0 7 6.5l-2.4-1-2 3.5 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.5 2.4-1a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.4 1 2-3.5z',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chevron: 'M9 5l7 7-7 7',
  down: 'M5 9l7 7 7-7',
  flame: 'M12 2.5c1 3.5 5.5 5.6 5.5 10.6a5.5 5.5 0 0 1-11 0c0-2 .8-3.6 2-4.8.2 1.6.9 2.6 2 3.1-.6-3.3.2-6.500 1.500-8.900z',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.800c.7.6 1.1 1.300 1.100 2.200h5c0-.9.4-1.600 1.100-2.200A6 6 0 0 0 12 3z',
  upload: 'M12 16V5M7.5 9.500 12 5l4.500 4.500M5 19.500h14',
  file: 'M7 3h7l5 5v11.500A1.500 1.500 0 0 1 17.500 21h-10.500A1.500 1.500 0 0 1 5.500 19.500v-15A1.500 1.500 0 0 1 7 3zM14 3v5h5',
  plus: 'M12 5v14M5 12h14',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  sparkle: 'M12 3l1.800 5.200L19 10l-5.200 1.800L12 17l-1.800-5.200L5 10l5.200-1.800zM19 16l.8 2.200L22 19l-2.200.8L19 22l-.8-2.200L16 19l2.200-.8z',
  note: 'M5 4h14v11l-5 5H5zM14 20v-5h5M8.500 8.500h7M8.500 12h4',
  bookmark: 'M7 3.500h10V21l-5-4-5 4z',
  share: 'M12 15V4M8 7.500 12 4l4 3.500M6 11.500v8h12v-8',
  chat: 'M20 12a7.500 7.500 0 0 1-11 6.600L4 20l1.400-4.300A7.500 7.500 0 1 1 20 12z',
  trash: 'M5 7h14M9.500 7V4.500h5V7M7 7l.8 12.500h8.400L17 7',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5.500 11h13v9.500h-13z',
  bell: 'M6 16.500V11a6 6 0 0 1 12 0v5.500l1.500 2h-15zM10 21h4',
  play: 'M8 5.500v13l10.500-6.500z',
  delete: 'M9 6h11v12H9l-5.500-6zM13 10l4 4M17 10l-4 4',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  question: 'M9.300 9.300a2.800 2.800 0 1 1 4.200 2.400c-.9.600-1.500 1.200-1.500 2.300M12 17.500v.1',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.500V12l3 2',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12v.1',
  refresh: 'M4.500 12a7.500 7.500 0 0 1 13-5l2 2M19.500 4.500V9H15M19.500 12a7.500 7.500 0 0 1-13 5l-2-2M4.500 19.500V15H9',
  underline: 'M7 4v7a5 5 0 0 0 10 0V4M5.500 20.500h13',
  eye: 'M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  left: 'M14 6l-6 6 6 6',
  right: 'M10 6l6 6-6 6',
  swap: 'M4 8h13M13.500 4.500 17 8l-3.500 3.500M20 16H7M10.500 12.500 7 16l3.500 3.500',
  alert: 'M12 4 2.500 20h19zM12 10v4.500M12 17.300v.1',
  dots: 'M5.500 12h.1M12 12h.1M18.500 12h.1',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, stroke = 2, fill }: { name: string; size?: number; stroke?: number; fill?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d={PATHS[name] ?? PATHS.question} />
    </svg>
  );
}
