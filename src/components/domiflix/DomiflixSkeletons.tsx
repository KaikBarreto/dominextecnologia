import { cn } from "@/lib/utils";

export function DomiflixHeroSkeleton() {
  return (
    <div className="relative w-full overflow-hidden" style={{ height: "min(56.25vw, 80vh)", minHeight: "320px" }}>
      <div className="absolute inset-0 bg-[#1c1c1c] animate-pulse" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/60 to-transparent" />
      <div className="absolute bottom-[18%] left-0 right-0 px-4 sm:px-8 md:px-16 animate-pulse">
        <div className="h-2.5 w-20 bg-[#333] rounded mb-3" />
        <div className="h-10 sm:h-14 w-72 sm:w-96 bg-[#2e2e2e] rounded mb-3" />
        <div className="h-3.5 w-80 bg-[#252525] rounded mb-2" />
        <div className="h-3.5 w-64 bg-[#252525] rounded mb-6" />
        <div className="flex gap-3">
          <div className="h-10 w-28 bg-[#3a3a3a] rounded" />
          <div className="h-10 w-32 bg-[#2a2a2a] rounded" />
        </div>
      </div>
    </div>
  );
}

function CardSkeleton({ variant = "poster" }: { variant?: "poster" | "continue" }) {
  return (
    <div className={cn(
      "flex-shrink-0 rounded bg-[#1e1e1e] animate-pulse",
      variant === "continue" ? "w-[260px] sm:w-[300px] aspect-video" : "w-[130px] sm:w-[155px] aspect-[2/3]"
    )} />
  );
}

export function DomiflixCarouselSkeleton({ variant = "poster", count = 7, labelWidth = "w-36" }: {
  variant?: "poster" | "continue"; count?: number; labelWidth?: string;
}) {
  return (
    <div className="mb-10">
      <div className={cn("h-4 bg-[#252525] rounded mb-4 mx-4 md:mx-12 animate-pulse", labelWidth)} />
      <div className="flex gap-1.5 px-4 md:px-12 overflow-hidden py-6">
        {Array.from({ length: count }).map((_, i) => <CardSkeleton key={i} variant={variant} />)}
      </div>
    </div>
  );
}

export function DomiflixPageSkeleton() {
  return (
    <div className="min-h-screen bg-[#141414]">
      <DomiflixHeroSkeleton />
      <div style={{ marginTop: "-60px" }} className="pb-16 relative z-10">
        <DomiflixCarouselSkeleton variant="continue" count={5} labelWidth="w-44" />
        <DomiflixCarouselSkeleton count={7} labelWidth="w-24" />
        <DomiflixCarouselSkeleton count={7} labelWidth="w-16" />
      </div>
    </div>
  );
}

export function DomiflixFilteredPageSkeleton() {
  return (
    <div className="min-h-screen bg-[#141414]" style={{ paddingTop: "56px" }}>
      <div className="pt-10 pb-6 px-4 md:px-12 animate-pulse">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="h-8 w-32 bg-[#2e2e2e] rounded" />
          <div className="h-4 w-80 bg-[#252525] rounded" />
        </div>
      </div>
      <DomiflixCarouselSkeleton count={7} />
      <DomiflixCarouselSkeleton count={7} labelWidth="w-28" />
    </div>
  );
}
