const HEARTS = ["💗", "💕", "💖", "🎀", "💝"];
const HEARTS_LIST = Array.from({ length: 18 }, (_, i) => ({
  emoji: HEARTS[i % HEARTS.length],
  left: Math.round((i * 137.5) % 100), // spread across width, deterministic (no hydration mismatch)
  size: 16 + (i % 5) * 6,
  duration: 10 + (i % 6) * 3,
  delay: -(i * 2.3),
  drift: (i % 2 === 0 ? 1 : -1) * (20 + (i % 4) * 15),
}));

export default function FloatingHearts() {
  return (
    <>
      {HEARTS_LIST.map((h, i) => (
        <span
          key={i}
          className="floating-heart"
          style={
            {
              left: `${h.left}%`,
              fontSize: h.size,
              animationDuration: `${h.duration}s`,
              animationDelay: `${h.delay}s`,
              "--drift": `${h.drift}px`,
            } as React.CSSProperties
          }
        >
          {h.emoji}
        </span>
      ))}
    </>
  );
}
