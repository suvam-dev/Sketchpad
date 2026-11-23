export default function BrandLogo({ size = 26 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" fill="#2563EB" />
      <path
        d="M9.5 22.5L11.2 16.8L20.3 7.7C21.1 6.9 22.4 6.9 23.2 7.7L24.3 8.8C25.1 9.6 25.1 10.9 24.3 11.7L15.2 20.8L9.5 22.5Z"
        stroke="#FFFFFF"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.2 9.8L22.2 13.8"
        stroke="#FFFFFF"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M9.5 25.2H22.5"
        stroke="#93C5FD"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
