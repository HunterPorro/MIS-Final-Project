import Image from "next/image";

const PLACEMENT_LOGOS: { src: string; alt: string }[] = [
  { src: "/placements/ubs.png", alt: "UBS" },
  { src: "/placements/pgim.png", alt: "PGIM" },
  { src: "/placements/meta.png", alt: "Meta" },
  { src: "/placements/bank-of-america.png", alt: "Bank of America" },
  { src: "/placements/deloitte.png", alt: "Deloitte" },
  { src: "/placements/kpmg.png", alt: "KPMG" },
  { src: "/placements/google.png", alt: "Google" },
];

export function PlacementsMarquee() {
  return (
    <section
      className="border-b border-white/5 py-12 sm:py-16 print:hidden"
      aria-label="Where students have placed"
    >
      <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Students have placed</p>
        <p className="mt-2 text-sm text-zinc-400">
          Recent finance internship and full-time outcomes from the founding team’s network—illustrative, not a guarantee.
        </p>
      </div>

      <div className="relative mt-10 overflow-hidden">
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#0A0A0A] to-transparent sm:w-24"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#0A0A0A] to-transparent sm:w-24"
          aria-hidden
        />

        <div className="placements-marquee-track">
          {[0, 1].map((dup) => (
            <div
              key={dup}
              className="flex shrink-0 items-center gap-5 px-4 sm:gap-7 md:gap-9 md:px-6"
            >
              {PLACEMENT_LOGOS.map((logo) => (
                <div
                  key={`${dup}-${logo.src}`}
                  className="relative h-11 w-[7.5rem] shrink-0 opacity-[0.92] sm:h-12 sm:w-36 md:h-14 md:w-40"
                >
                  <Image
                    src={logo.src}
                    alt={logo.alt}
                    fill
                    className="object-contain object-center"
                    sizes="(max-width: 640px) 120px, 160px"
                    priority={dup === 0}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
