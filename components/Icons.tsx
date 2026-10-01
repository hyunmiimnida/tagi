// 화면에 쓰는 선 아이콘. 글자색(currentColor)을 따라간다

type IconProps = { size?: number; filled?: boolean };

function Svg({ size = 24, children }: { size?: number; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const HomeIcon = ({ size, filled }: IconProps) => (
  <Svg size={size}>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" fill={filled ? "currentColor" : "none"} />
  </Svg>
);

export const ListIcon = ({ size, filled }: IconProps) => (
  <Svg size={size}>
    <rect x="4" y="4" width="16" height="16" rx="3" fill={filled ? "currentColor" : "none"} />
    <path d="M8 9h8M8 12h8M8 15h5" stroke={filled ? "var(--surface)" : "currentColor"} />
  </Svg>
);

export const CalendarIcon = ({ size, filled }: IconProps) => (
  <Svg size={size}>
    <rect x="4" y="5.5" width="16" height="14.5" rx="3" fill={filled ? "currentColor" : "none"} />
    <path d="M8 3.5v4M16 3.5v4" />
    <path d="M4 10.5h16" stroke={filled ? "var(--surface)" : "currentColor"} />
  </Svg>
);

export const StarIcon = ({ size = 22, filled }: IconProps) => (
  <Svg size={size}>
    <path
      d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8z"
      fill={filled ? "currentColor" : "none"}
      strokeWidth={1.8}
    />
  </Svg>
);

export const SearchIcon = ({ size = 20 }: IconProps) => (
  <Svg size={size}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </Svg>
);

export const ChevronIcon = ({ size = 18, dir = "right" }: IconProps & { dir?: "left" | "right" | "down" }) => (
  <Svg size={size}>
    <path d={dir === "left" ? "m14.5 6-6 6 6 6" : dir === "down" ? "m6 9.5 6 6 6-6" : "m9.5 6 6 6-6 6"} />
  </Svg>
);

export const ShareIcon = ({ size = 20 }: IconProps) => (
  <Svg size={size}>
    <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
    <path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
  </Svg>
);

export const CalendarPlusIcon = ({ size = 20 }: IconProps) => (
  <Svg size={size}>
    <rect x="4" y="5.5" width="16" height="14.5" rx="3" />
    <path d="M8 3.5v4M16 3.5v4M12 11.5v5M9.5 14h5" />
  </Svg>
);

export const ExternalIcon = ({ size = 18 }: IconProps) => (
  <Svg size={size}>
    <path d="M14 5h5v5M19 5l-8 8" />
    <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
  </Svg>
);

export const CloseIcon = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Svg>
);

export const ProfileIcon = ({ size, filled }: IconProps) => (
  <Svg size={size}>
    <circle cx="12" cy="8.5" r="3.8" fill={filled ? "currentColor" : "none"} />
    <path d="M4.5 20c.8-3.7 3.9-6 7.5-6s6.7 2.3 7.5 6z" fill={filled ? "currentColor" : "none"} />
  </Svg>
);
