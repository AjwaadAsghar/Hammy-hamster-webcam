import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Happy Birthday Stinky - a hamster reacts live to your webcam";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(160deg, #ffd6e8 0%, #ffb6d5 35%, #ff8fc4 70%, #ff6fb0 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", gap: 24, fontSize: 90 }}>
          <span>💗</span>
          <span>🐹</span>
          <span>🎀</span>
        </div>
        <div
          style={{
            marginTop: 24,
            fontSize: 88,
            fontWeight: 800,
            color: "#a3145a",
            textShadow: "0 4px 0 rgba(255,255,255,0.6)",
          }}
        >
          Happy Birthday Stinky!
        </div>
        <div
          style={{
            marginTop: 20,
            fontSize: 34,
            fontWeight: 600,
            color: "#8a1450",
          }}
        >
          Pull faces, a hamster reacts live 🎉
        </div>
      </div>
    ),
    { ...size }
  );
}
