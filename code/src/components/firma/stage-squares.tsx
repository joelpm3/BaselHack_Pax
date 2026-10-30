import { FUNNEL_STAGES, type FunnelStage, stageIndex } from "@/lib/domain/taxonomy";
import { cn } from "@/lib/utils";

/**
 * Funnel progress as nine squares (the Pax dot is the visual unit): a purple trail up to the
 * furthest stage reached, which is the green square.
 */
export function StageSquares({
  stage,
  label,
  className,
}: {
  stage: FunnelStage;
  label: string;
  className?: string;
}) {
  const reached = stageIndex(stage);
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn("inline-flex shrink-0 items-center gap-[3px]", className)}
    >
      {FUNNEL_STAGES.map((s, i) => (
        <span
          key={s}
          className={cn(
            "size-2",
            i < reached ? "bg-pax-purple" : i === reached ? "bg-pax-green" : "bg-gray-2",
          )}
        />
      ))}
    </span>
  );
}
