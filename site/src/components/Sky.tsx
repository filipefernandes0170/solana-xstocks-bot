const BIRDS = [
  { top: "8%", size: 56, duration: "26s", delay: "0s" },
  { top: "18%", size: 36, duration: "19s", delay: "-6s" },
  { top: "32%", size: 72, duration: "34s", delay: "-14s" },
  { top: "58%", size: 28, duration: "22s", delay: "-9s" },
  { top: "72%", size: 48, duration: "30s", delay: "-18s" },
  { top: "86%", size: 40, duration: "24s", delay: "-3s" },
];

const STARS = [
  { top: "8%", left: "6%", delay: "0s" },
  { top: "16%", left: "18%", delay: "1.2s" },
  { top: "11%", left: "34%", delay: "0.4s" },
  { top: "22%", left: "48%", delay: "2s" },
  { top: "7%", left: "62%", delay: "0.8s" },
  { top: "28%", left: "72%", delay: "1.6s" },
  { top: "18%", left: "88%", delay: "0.2s" },
  { top: "40%", left: "12%", delay: "2.4s" },
  { top: "52%", left: "78%", delay: "1s" },
  { top: "64%", left: "24%", delay: "1.8s" },
];

/** Decorative night sky: a moon, twinkling stars and birds crossing. */
export function Sky() {
  return (
    <div className="sky" aria-hidden>
      <span className="moon" />
      {STARS.map((star) => (
        <span key={`${star.top}-${star.left}`} className="star" style={{ top: star.top, left: star.left, animationDelay: star.delay }} />
      ))}
      {BIRDS.map((bird) => (
        <span
          key={bird.top}
          className="bird"
          style={{ top: bird.top, width: bird.size, animationDuration: bird.duration, animationDelay: bird.delay }}
        >
          <svg viewBox="0 0 64 28" fill="currentColor">
            <path className="wing" d="M32 16 C22 14 12 4 2 9 C14 11 24 16 32 16 Z" />
            <path className="wing wing-late" d="M32 16 C42 14 52 4 62 9 C50 11 40 16 32 16 Z" />
            <ellipse cx="32" cy="16.5" rx="2.2" ry="1.6" />
          </svg>
        </span>
      ))}
    </div>
  );
}
