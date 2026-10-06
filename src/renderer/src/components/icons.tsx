import type { ReactNode } from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

function make(paths: ReactNode, filled = false) {
  return function Icon({ size = 16, className }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={filled ? 'currentColor' : 'none'}
        stroke={filled ? 'none' : 'currentColor'}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {paths}
      </svg>
    );
  };
}

export const IconChat = make(<path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-6.2L8.5 20v-3.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5Z" />);
export const IconMeeting = make(<><circle cx="9" cy="9" r="3" /><path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5" /><path d="M15.5 6.5a3 3 0 0 1 0 5.5M17.5 14.8c1.7.6 2.7 2 3 4.2" /></>);
export const IconHistory = make(<><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" /><path d="M3.5 4.5v4h4" /><path d="M12 7.5V12l3 2" /></>);
export const IconSettings = make(<><circle cx="12" cy="12" r="2.8" /><path d="M19 12a7 7 0 0 0-.1-1.3l1.9-1.5-1.8-3.1-2.3.9a7 7 0 0 0-2.2-1.3L14.1 3.3h-3.6l-.4 2.4a7 7 0 0 0-2.2 1.3l-2.3-.9-1.8 3.1 1.9 1.5a7 7 0 0 0 0 2.6l-1.9 1.5 1.8 3.1 2.3-.9a7 7 0 0 0 2.2 1.3l.4 2.4h3.6l.4-2.4a7 7 0 0 0 2.2-1.3l2.3.9 1.8-3.1-1.9-1.5c.1-.4.1-.9.1-1.3Z" /></>);
export const IconPlus = make(<path d="M12 5v14M5 12h14" />);
export const IconSend = make(<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />);
export const IconStop = make(<rect x="7" y="7" width="10" height="10" rx="2" />, true);
export const IconCopy = make(<><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M5.5 15.5h-.5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h9A1.5 1.5 0 0 1 15.5 5v.5" /></>);
export const IconCheck = make(<path d="m5 12.5 4.5 4.5L19 7.5" />);
export const IconRefresh = make(<><path d="M20 12a8 8 0 0 1-13.7 5.7M4 12a8 8 0 0 1 13.7-5.7" /><path d="M18 3v4h-4M6 21v-4h4" /></>);
export const IconTrash = make(<><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12" /><path d="M10 11v5.5M14 11v5.5" /></>);
export const IconImage = make(<><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m4.5 17.5 4.8-4.3a1.5 1.5 0 0 1 2 0l2.2 2 1.7-1.5a1.5 1.5 0 0 1 2 0l2.3 2.1" /></>);
export const IconCrop = make(<><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" /><circle cx="12" cy="12" r="2.5" /></>);
export const IconShield = make(<path d="M12 3.5 5 6v5.5c0 4.3 2.8 7.4 7 9 4.2-1.6 7-4.7 7-9V6l-7-2.5Z" />);
export const IconShieldOn = make(<><path d="M12 3.5 5 6v5.5c0 4.3 2.8 7.4 7 9 4.2-1.6 7-4.7 7-9V6l-7-2.5Z" /><path d="m9 12 2.2 2.2L15.2 10" /></>);
export const IconEyeOff = make(<><path d="M4 4l16 16" /><path d="M9.9 5.3A9.7 9.7 0 0 1 12 5c4.5 0 7.8 3 9.5 7a12.6 12.6 0 0 1-2.9 4M6.3 6.8A12.3 12.3 0 0 0 2.5 12c1.7 4 5 7 9.5 7 1.5 0 2.9-.3 4.1-.9" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>);
export const IconPanel = make(<><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M14.5 4.5v15" /></>);
export const IconCompact = make(<><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M14 10h-4v4" opacity="0" /><path d="M9.5 14.5 14.5 9.5M14.5 13V9.5H11" /></>);
export const IconExpand = make(<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />);
export const IconShrink = make(<path d="M20 10h-6V4M4 14h6v6M14 10l6-6M10 14l-6 6" />);
export const IconPin = make(<><path d="M9 4.5h6l-.7 5 3.2 3.5H6.5L9.7 9.5 9 4.5Z" /><path d="M12 13v7" /></>);
export const IconMinus = make(<path d="M6 12h12" />);
export const IconClose = make(<path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />);
export const IconMic = make(<><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" /></>);
export const IconSpark = make(<path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18l-1.8-5.4-5.7-1.8L10.2 9 12 3.5ZM18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" />);
export const IconSearch = make(<><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>);
export const IconPlay = make(<path d="M8 5.5v13l10.5-6.5L8 5.5Z" />, true);
export const IconFolder = make(<path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4.2l2 2H19A1.5 1.5 0 0 1 20.5 9v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5V7Z" />);
export const IconKey = make(<><circle cx="8" cy="15" r="4" /><path d="m11 12 8.5-8.5M16 7l2.5 2.5M13.5 9.5l2 2" /></>);
export const IconAlert = make(<><path d="M12 4 3 19.5h18L12 4Z" /><path d="M12 10v4.5M12 17.2v.1" /></>);
export const IconPower = make(<><path d="M12 3.5v8" /><path d="M7 6.5a7.5 7.5 0 1 0 10 0" /></>);

/** The Undertone mark: a voice, with the tone that sits underneath it. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="ut-g" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFC896" />
          <stop offset="1" stopColor="#FF7F5E" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="#15171D" />
      <rect x=".5" y=".5" width="31" height="31" rx="8.5" fill="none" stroke="#fff" strokeOpacity=".08" />
      <circle cx="16" cy="11" r="4" fill="url(#ut-g)" />
      <path d="M7.5 17.5c2.6 4.3 14.4 4.3 17 0" fill="none" stroke="url(#ut-g)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M11.5 24c2.2 1.7 6.8 1.7 9 0" fill="none" stroke="url(#ut-g)" strokeWidth="2.2" strokeLinecap="round" opacity=".5" />
    </svg>
  );
}
