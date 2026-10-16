/**
 * The Google Meet and Zoom marks, drawn inline so they need no request and stay sharp at any
 * size. Same artwork as the marketing site's integrations page (website/public/integrations).
 * Decorative: the text beside them always names the service.
 */
export function GoogleMeetLogo({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden focusable="false">
      <rect width="16" height="16" x="12" y="16" fill="#fff" transform="rotate(-90 20 24)" />
      <polygon fill="#1e88e5" points="3,17 3,31 8,32 13,31 13,17 8,16" />
      <path fill="#4caf50" d="M37,24v14c0,1.657-1.343,3-3,3H13l-1-5l1-5h14v-7l5-1L37,24z" />
      <path fill="#fbc02d" d="M37,10v14H27v-7H13l-1-5l1-5h21C35.657,7,37,8.343,37,10z" />
      <path fill="#1565c0" d="M13,31v10H6c-1.657,0-3-1.343-3-3v-7H13z" />
      <polygon fill="#e53935" points="13,7 13,17 3,17" />
      <polygon fill="#2e7d32" points="38,24 37,32.45 27,24 37,15.55" />
      <path
        fill="#4caf50"
        d="M46,10.11v27.78c0,0.84-0.98,1.31-1.63,0.78L37,32.45v-16.9l7.37-6.22C45.02,8.8,46,9.27,46,10.11z"
      />
    </svg>
  );
}

export function ZoomLogo({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden focusable="false">
      <rect width="40" height="40" x="4" y="4" rx="10" fill="#2d8cff" />
      <path
        fill="#fff"
        d="M11,18.5c0-1.381,1.119-2.5,2.5-2.5H26c2.209,0,4,1.791,4,4v9c0,1.381-1.119,2.5-2.5,2.5H15c-2.209,0-4-1.791-4-4V18.5z"
      />
      <path
        fill="#fff"
        d="M32,21.5l4.553-3.415C37.212,17.591,38,18.061,38,18.885v10.23c0,0.824-0.788,1.294-1.447,0.8L32,26.5V21.5z"
      />
    </svg>
  );
}
