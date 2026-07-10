import type { SVGProps } from 'react';

/**
 * Ikon garis (Lucide-style, stroke 1.6) — inline SVG tanpa dependency.
 * Dipakai di Sidebar & shell. Tambah entri baru di PATHS.
 */
export type IconName =
  | 'dashboard'
  | 'package'
  | 'truck'
  | 'users'
  | 'folder'
  | 'percent'
  | 'book-open'
  | 'notebook'
  | 'book'
  | 'cart'
  | 'bag'
  | 'wallet'
  | 'boxes'
  | 'list'
  | 'clipboard'
  | 'building'
  | 'trending-down'
  | 'trending-up'
  | 'receipt'
  | 'file'
  | 'scale'
  | 'swap'
  | 'chart'
  | 'coins'
  | 'target'
  | 'search'
  | 'calendar'
  | 'network'
  | 'user-cog'
  | 'sliders'
  | 'layers'
  | 'menu'
  | 'close'
  | 'logout'
  | 'chevron-down';

import type { ReactNode } from 'react';

const PATHS: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </>
  ),
  package: (
    <>
      <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
      <path d="M3 8l9 5 9-5" />
      <path d="M12 13v8" />
    </>
  ),
  truck: (
    <>
      <rect x="1" y="6" width="13" height="9" rx="1" />
      <path d="M14 9h4l3 3v3h-7z" />
      <circle cx="6" cy="18" r="1.6" />
      <circle cx="18" cy="18" r="1.6" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 4.7a3.2 3.2 0 010 6.2" />
      <path d="M21 20c0-2.5-1.5-4.6-3.6-5.5" />
    </>
  ),
  folder: <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />,
  percent: (
    <>
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="7.5" cy="7.5" r="2.2" />
      <circle cx="16.5" cy="16.5" r="2.2" />
    </>
  ),
  'book-open': (
    <>
      <path d="M12 6C10 4.5 7 4 4 4v14c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2z" />
      <line x1="12" y1="6" x2="12" y2="22" />
    </>
  ),
  notebook: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="12" y1="8" x2="16" y2="8" />
      <line x1="12" y1="12" x2="16" y2="12" />
    </>
  ),
  book: (
    <>
      <path d="M6 4h11a1 1 0 011 1v15a1 1 0 01-1 1H6a2 2 0 01-2-2V6a2 2 0 012-2z" />
      <line x1="8" y1="4" x2="8" y2="21" />
    </>
  ),
  cart: (
    <>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="17" cy="20" r="1.4" />
      <path d="M3 4h2l2.4 12h10l2-8H6" />
    </>
  ),
  bag: (
    <>
      <path d="M6 8h12l-1 12H7L6 8z" />
      <path d="M9 8V6a3 3 0 016 0v2" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M16 12h4v4h-4a2 2 0 010-4z" />
      <path d="M3 8V7a2 2 0 012-2h11" />
    </>
  ),
  boxes: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="8" rx="1" />
      <rect x="8" y="13" width="8" height="8" rx="1" />
    </>
  ),
  list: (
    <>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <rect x="9" y="2.5" width="6" height="3.5" rx="1" />
      <path d="M9 13l2 2 4-4" />
    </>
  ),
  building: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1" />
      <rect x="8" y="6" width="2" height="2" />
      <rect x="14" y="6" width="2" height="2" />
      <rect x="8" y="11" width="2" height="2" />
      <rect x="14" y="11" width="2" height="2" />
      <path d="M10 21v-4h4v4" />
    </>
  ),
  'trending-down': (
    <>
      <polyline points="3 7 9 13 13 9 21 17" />
      <polyline points="21 11 21 17 15 17" />
    </>
  ),
  'trending-up': (
    <>
      <polyline points="3 17 9 11 13 15 21 7" />
      <polyline points="15 7 21 7 21 13" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="9" y1="12" x2="15" y2="12" />
    </>
  ),
  file: (
    <>
      <path d="M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M14 3v4h4" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="16" x2="15" y2="16" />
    </>
  ),
  scale: (
    <>
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="6" y1="21" x2="18" y2="21" />
      <line x1="4" y1="7" x2="20" y2="7" />
      <path d="M4 7l-2 5a3 3 0 006 0z" />
      <path d="M20 7l-2 5a3 3 0 006 0z" />
      <path d="M12 3l-3 4h6z" />
    </>
  ),
  swap: (
    <>
      <path d="M7 4l-3 3 3 3" />
      <line x1="4" y1="7" x2="20" y2="7" />
      <path d="M17 14l3 3-3 3" />
      <line x1="20" y1="17" x2="4" y2="17" />
    </>
  ),
  chart: (
    <>
      <path d="M4 4v16h16" />
      <polyline points="7 14 11 10 14 13 19 7" />
    </>
  ),
  coins: (
    <>
      <circle cx="9" cy="9" r="6" />
      <path d="M15 6.2A6 6 0 1118 15" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.7" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M8.5 11l2 2 4-4" />
      <line x1="20" y1="20" x2="16" y2="16" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="8" y1="3" x2="8" y2="6" />
      <line x1="16" y1="3" x2="16" y2="6" />
    </>
  ),
  network: (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="12" cy="18" r="2" />
      <path d="M7.5 7.6L11 16M16.5 7.6L13 16" />
    </>
  ),
  'user-cog': (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6 .7 0 1.4.1 2 .3" />
      <circle cx="18" cy="16" r="2.4" />
      <path d="M18 12.4v1.2M18 18.4v1.2M21.1 14.2l-1 .6M15.9 17.2l-1 .6M21.1 17.8l-1-.6M15.9 14.8l-1-.6" />
    </>
  ),
  sliders: (
    <>
      <line x1="4" y1="8" x2="20" y2="8" />
      <line x1="4" y1="16" x2="20" y2="16" />
      <circle cx="9" cy="8" r="2" />
      <circle cx="15" cy="16" r="2" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
    </>
  ),
  menu: (
    <>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </>
  ),
  close: (
    <>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </>
  ),
  logout: (
    <>
      <path d="M9 4H6a2 2 0 00-2 2v12a2 2 0 002 2h3" />
      <path d="M16 17l5-5-5-5" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </>
  ),
  'chevron-down': <polyline points="6 9 12 15 18 9" />,
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
