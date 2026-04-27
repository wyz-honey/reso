export function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function IconPause() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden>
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

export function IconMic() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 15a4 4 0 0 0 4-4V7a4 4 0 1 0-8 0v4a4 4 0 0 0 4 4Z" />
      <path d="M19 11a7 7 0 0 1-14 0M12 18.5V21" />
      <path d="M9 21h6" />
    </svg>
  );
}

export function IconMicMuted() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 10.5V7a3 3 0 1 1 6 0v4a3 3 0 0 1-.55 1.76" />
      <path d="M17.6 14.1A6.7 6.7 0 0 1 12 17a7 7 0 0 1-7-7" />
      <path d="M12 17v4M9 21h6" />
      <path d="M4 4l16 16" />
    </svg>
  );
}

export function IconCliParams() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
      <path d="M8 18h2M14 11h2M17 16h2" />
    </svg>
  );
}

export function IconPlus() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconClock() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5l3.3 2" />
    </svg>
  );
}

export function IconEraser() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18.2 4.8a2.2 2.2 0 0 1 0 3.1l-8.9 8.9H5.8a2.8 2.8 0 0 1-2-4.8l8.7-8.7a2.2 2.2 0 0 1 3.1 0Z" />
      <path d="M10.1 16.8 6.7 13.4M14.5 20.2h5.7" />
    </svg>
  );
}

export function IconSidebarToggle({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.2" />
      <path d="M9 4.5v15" />
      {collapsed ? <path d="m15.5 12-2.8-2.2M15.5 12l-2.8 2.2" /> : <path d="m12.7 12 2.8-2.2M12.7 12l2.8 2.2" />}
    </svg>
  );
}

export function IconContext() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="5" width="16" height="14" rx="2.5" />
      <path d="M8 9.5h8M8 12.5h8M8 15.5h5.5" />
    </svg>
  );
}
