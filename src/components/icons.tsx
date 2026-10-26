// 선 아이콘 모음 (24x24, currentColor)

import type { ReactNode } from 'react';

const Svg = ({ children, size = 20 }: { children: ReactNode; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const Icon = {
  select: () => (
    <Svg>
      <path d="M5 3l14 7-6.5 2L10 19z" />
    </Svg>
  ),
  hand: () => (
    <Svg>
      <path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
    </Svg>
  ),
  rect: () => (
    <Svg>
      <rect x="4" y="6" width="16" height="12" rx="2" />
    </Svg>
  ),
  ellipse: () => (
    <Svg>
      <circle cx="12" cy="12" r="8" />
    </Svg>
  ),
  text: () => (
    <Svg>
      <path d="M5 6h14M12 6v13M9 19h6" />
    </Svg>
  ),
  sticky: () => (
    <Svg>
      <path d="M5 4h14v10l-6 6H5z" />
      <path d="M13 20v-6h6" />
    </Svg>
  ),
  number: () => (
    <Svg>
      <path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16" />
    </Svg>
  ),
  checklist: () => (
    <Svg>
      <rect x="3" y="4" width="6" height="6" rx="1" />
      <path d="M4.5 7l1 1 2-2M12 7h9M12 17h9" />
      <rect x="3" y="14" width="6" height="6" rx="1" />
    </Svg>
  ),
  image: () => (
    <Svg>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M21 16l-5-5-8 8" />
    </Svg>
  ),
  connect: () => (
    <Svg>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M8 16l8-8" />
    </Svg>
  ),
  undo: () => (
    <Svg size={18}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 010 12h-3" />
    </Svg>
  ),
  redo: () => (
    <Svg size={18}>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H10a6 6 0 000 12h3" />
    </Svg>
  ),
  home: () => (
    <Svg size={18}>
      <path d="M4 11l8-7 8 7v9H4z" />
    </Svg>
  ),
  sun: () => (
    <Svg size={18}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Svg>
  ),
  moon: () => (
    <Svg size={18}>
      <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />
    </Svg>
  ),
  check: () => (
    <Svg size={14}>
      <path d="M5 12l5 5 9-10" />
    </Svg>
  ),
  plus: () => (
    <Svg size={18}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  folder: () => (
    <Svg size={18}>
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    </Svg>
  ),
  trash: () => (
    <Svg size={16}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </Svg>
  ),
  close: () => (
    <Svg size={14}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  ),
  swap: () => (
    <Svg size={16}>
      <path d="M7 7h13l-4-4M17 17H4l4 4" />
    </Svg>
  ),
  shapeRect: () => (
    <Svg size={18}>
      <rect x="4" y="6" width="16" height="12" />
    </Svg>
  ),
  shapeRounded: () => (
    <Svg size={18}>
      <rect x="4" y="6" width="16" height="12" rx="3.5" />
    </Svg>
  ),
  shapeEllipse: () => (
    <Svg size={18}>
      <ellipse cx="12" cy="12" rx="8.5" ry="7" />
    </Svg>
  ),
  shapeDiamond: () => (
    <Svg size={18}>
      <path d="M12 3l9 9-9 9-9-9z" />
    </Svg>
  ),
};
