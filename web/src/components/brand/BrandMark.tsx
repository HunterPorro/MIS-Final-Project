import React from "react";

export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 shadow-[0_18px_50px_-30px_rgba(0,0,0,0.85)]"
      style={{ width: size, height: size, boxShadow: "0 18px 50px -30px rgba(79, 70, 229, 0.55)" }}
      aria-hidden
    >
      <svg width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} viewBox="0 0 24 24" fill="none">
        <path
          d="M6.5 7.2c0-1 0.8-1.8 1.8-1.8h7.4c1 0 1.8.8 1.8 1.8v9.6c0 1-.8 1.8-1.8 1.8H8.3c-1 0-1.8-.8-1.8-1.8V7.2Z"
          stroke="rgba(255,255,255,0.75)"
          strokeWidth="1.4"
        />
        <path
          d="M9 9h6M9 12h4.8M9 15h5.4"
          stroke="rgba(96,165,250,0.85)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M17.8 6.6 16.4 5.2"
          stroke="rgba(79,70,229,0.9)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

