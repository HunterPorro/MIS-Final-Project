/** Lockup for “Final” + “Round” — use next to BrandMark in header/footer. */
export function BrandWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-brand text-[15px] font-semibold leading-none tracking-[-0.045em] sm:text-base ${className}`}>
      <span className="text-white">Final</span>
      <span className="font-medium text-zinc-400"> Round</span>
    </span>
  );
}

export function BrandMark({
  size = 36,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const dim = size;
  const fs = Math.max(11, Math.round(dim * 0.36));
  const r = Math.round(dim * 0.24);

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden border border-white/[0.14] bg-gradient-to-br from-white/[0.12] via-zinc-900/35 to-zinc-950/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.13),0_10px_36px_-16px_rgba(0,0,0,0.9)] ring-1 ring-inset ring-white/[0.05] transition-[border-color,box-shadow,transform] duration-200 group-hover:border-white/[0.22] group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_40px_-14px_rgba(0,0,0,0.88)] motion-safe:group-hover:-translate-y-px ${className}`}
      style={{ width: dim, height: dim, borderRadius: r }}
      aria-hidden
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_30%_-20%,rgba(99,102,241,0.18),transparent_55%)]"
      />
      <span
        className="relative font-brand text-white select-none"
        style={{
          fontSize: fs,
          fontWeight: 700,
          letterSpacing: "-0.14em",
          lineHeight: 1,
        }}
      >
        FR
      </span>
    </span>
  );
}
