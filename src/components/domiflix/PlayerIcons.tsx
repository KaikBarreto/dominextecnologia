interface IconProps { className?: string; }

export function PlayIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 52 52" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M39.5561 24.4165C41.1467 25.4272 41.1292 27.7546 39.5237 28.7413L12.8852 45.1123C11.1861 46.1565 9 44.934 9 42.9398L9 9.64164C9 7.63021 11.2199 6.41063 12.9176 7.4894L39.5561 24.4165Z" fill="currentColor"/>
    </svg>
  );
}

export function PauseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 52 52" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="11" y="8" width="10" height="36" rx="2" fill="currentColor"/>
      <rect x="31" y="8" width="10" height="36" rx="2" fill="currentColor"/>
    </svg>
  );
}

export function FullscreenIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 52 52" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M5.41 21.4L5.41 13.4C5.41 12.29 6.31 11.4 7.41 11.4L19.91 11.4" stroke="currentColor" strokeWidth="4"/>
      <path d="M45.59 30.69L45.59 38.69C45.59 39.79 44.69 40.69 43.59 40.69L31.09 40.69" stroke="currentColor" strokeWidth="4"/>
      <path d="M5.41 29.69L5.41 37.69C5.41 38.79 6.31 39.69 7.41 39.69L19.91 39.69" stroke="currentColor" strokeWidth="4"/>
      <path d="M45.59 21.4L45.59 13.4C45.59 12.29 44.69 11.4 43.59 11.4L31.09 11.4" stroke="currentColor" strokeWidth="4"/>
    </svg>
  );
}

export function MinimizeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 52 52" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M19.91 11.4L19.91 19.4C19.91 20.5 19.01 21.4 17.91 21.4L5.41 21.4" stroke="currentColor" strokeWidth="4"/>
      <path d="M31.09 40.69L31.09 32.69C31.09 31.59 31.99 30.69 33.09 30.69L45.59 30.69" stroke="currentColor" strokeWidth="4"/>
      <path d="M19.91 39.69L19.91 31.69C19.91 30.59 19.01 29.69 17.91 29.69L5.41 29.69" stroke="currentColor" strokeWidth="4"/>
      <path d="M31.09 11.4L31.09 19.4C31.09 20.5 31.99 21.4 33.09 21.4L45.59 21.4" stroke="currentColor" strokeWidth="4"/>
    </svg>
  );
}

export function VolumeHighIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 60 50" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M28 2.4c-.4-.2-.9-.3-1.4-.2-.5 0-.9.2-1.3.5L12.5 12.9H2.7C2 12.9 1.3 13.2.8 13.7.3 14.2 0 14.8 0 15.6v16.1c0 .7.3 1.4.8 1.9.5.5 1.2.8 1.9.8h9.8L25.3 44.5c.5.4 1.1.6 1.7.6.4 0 .8-.1 1.2-.3.5-.2.8-.6 1.1-1 .3-.4.4-.9.4-1.4V4.8c0-.5-.1-1-.4-1.4-.3-.4-.6-.8-1.1-1z"/>
      <path d="M35.3 44.7c0 .8.7 1.5 1.5 1.4 5.5-.4 10.8-2.7 14.7-6.7 4.3-4.3 6.7-10.1 6.7-16.2 0-6.1-2.4-11.9-6.7-16.2-3.9-3.9-9.2-6.3-14.7-6.7-.8 0-1.5.6-1.5 1.4 0 .8.7 1.5 1.5 1.5 4.7.4 9.2 2.4 12.6 5.8 3.7 3.7 5.8 8.8 5.8 14.1s-2.1 10.4-5.8 14.1c-3.4 3.4-7.9 5.4-12.6 5.8-.8.1-1.5.7-1.5 1.5z"/>
      <path d="M35.3 33.3c0 .8.6 1.4 1.4 1.3 2.5-.3 4.9-1.5 6.7-3.3 2.2-2.2 3.4-5.1 3.4-8.1s-1.2-6-3.4-8.1c-1.8-1.8-4.2-3-6.7-3.3-.8-.1-1.4.5-1.4 1.3 0 .8.6 1.4 1.4 1.5 1.7.3 3.4 1.1 4.7 2.4 1.6 1.6 2.5 3.8 2.5 6.1s-.9 4.5-2.5 6.1c-1.3 1.3-3 2.1-4.7 2.4-.8.1-1.4.7-1.4 1.5z"/>
    </svg>
  );
}

export function VolumeMutedIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 60 50" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M28 2.4c-.4-.2-.9-.3-1.4-.2-.5 0-.9.2-1.3.5L12.5 12.9H2.7C2 12.9 1.3 13.2.8 13.7.3 14.2 0 14.8 0 15.6v16.1c0 .7.3 1.4.8 1.9.5.5 1.2.8 1.9.8h9.8L25.3 44.5c.5.4 1.1.6 1.7.6.4 0 .8-.1 1.2-.3.5-.2.8-.6 1.1-1 .3-.4.4-.9.4-1.4V4.8c0-.5-.1-1-.4-1.4-.3-.4-.6-.8-1.1-1z"/>
      <path d="M37 14 L51 28 M51 14 L37 28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none"/>
    </svg>
  );
}
