import Link from "next/link";
import FloatingHearts from "./components/FloatingHearts";

const POLAROIDS = [
  { src: "/memes/hug.jpg", top: "4%", left: "2%", rotate: -12, size: 128 },
  { src: "/memes/thumbs_up.jpg", top: "8%", right: "3%", rotate: 10, size: 112 },
  { src: "/memes/thinking.jpg", bottom: "10%", left: "0%", rotate: 8, size: 120 },
  { src: "/memes/default.jpg", bottom: "4%", right: "1%", rotate: -8, size: 132 },
];

export default function Home() {
  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-16 text-center"
      style={{
        background:
          "linear-gradient(160deg, #ffd6e8 0%, #ffb6d5 35%, #ff8fc4 70%, #ff6fb0 100%)",
      }}
    >
      <FloatingHearts />

      {/* Decorative polaroid hamsters, desktop/tablet only */}
      {POLAROIDS.map((p, i) => (
        <div
          key={i}
          className="absolute z-0 hidden rounded-lg bg-white p-2 shadow-xl sm:block"
          style={{
            top: p.top,
            left: p.left,
            right: p.right,
            bottom: p.bottom,
            transform: `rotate(${p.rotate}deg)`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.src}
            alt=""
            width={p.size}
            height={p.size}
            style={{ width: p.size, height: p.size, objectFit: "cover", borderRadius: 4 }}
          />
        </div>
      ))}

      <div className="relative z-10 flex flex-col items-center">
        <div className="text-5xl">🎂🐹🎉</div>

        <div
          className="mt-6 overflow-hidden rounded-full shadow-2xl ring-8 ring-white/70"
          style={{ width: 176, height: 176 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/memes/shy.jpg"
            alt="A very happy hamster"
            width={176}
            height={176}
            style={{ width: 176, height: 176, objectFit: "cover" }}
          />
        </div>

        <h1
          className="mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl"
          style={{ color: "#a3145a", textShadow: "0 2px 0 rgba(255,255,255,0.6)" }}
        >
          Happy Birthday Stinky!
        </h1>
        <p className="mt-3 max-w-sm text-base font-medium text-pink-900/80">
          Point your webcam at yourself and pull faces — a hamster reacts live, just for you.
        </p>

        <Link
          href="/camera"
          className="mt-9 rounded-full px-9 py-4 text-lg font-bold text-white shadow-xl transition-transform hover:scale-105 active:scale-95"
          style={{ background: "linear-gradient(90deg, #ff6fb0, #ff3d94)" }}
        >
          Open for your stinky fart 🎀
        </Link>
      </div>
    </div>
  );
}
