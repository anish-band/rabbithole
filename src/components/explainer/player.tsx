"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { useId, useState } from "react";
import { MathText } from "@/components/math-text";
import { CANVAS, type ScenesExplainer } from "@/lib/explainer/schema";
import { StageDefs, StageElement } from "./elements";

const controlButton =
  "flex size-9 shrink-0 items-center justify-center rounded-full text-white/80 transition-[background-color,color,transform] duration-200 ease-spring hover:bg-white/10 hover:text-white active:scale-[0.94] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70";

/**
 * Plays a scenes explainer on the dark stage. Element motion is pure CSS
 * (composited opacity/transform/stroke-dashoffset, all keyed off the script's
 * timings); the active progress segment's own CSS animation drives scene
 * changes, so pausing is a single `animation-play-state` switch. Plays only
 * while its paper is the active one. Reduced motion: elements appear without
 * moving, captions and progress still advance.
 */
export function ExplainerPlayer({ script, active }: { script: ScenesExplainer; active: boolean }) {
  const ids = useId().replace(/:/g, "");
  const [scene, setScene] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [ended, setEnded] = useState(false);
  const [run, setRun] = useState(0);

  const count = script.scenes.length;
  const current = script.scenes[scene];
  const playing = active && !userPaused && !ended;

  const goTo = (index: number) => {
    setScene(index);
    setEnded(false);
    setRun((r) => r + 1);
  };
  const replay = () => {
    setUserPaused(false);
    goTo(0);
  };
  const onSceneEnd = () => {
    if (scene < count - 1) setScene(scene + 1);
    else setEnded(true);
  };

  return (
    <div data-paused={playing ? undefined : ""} className="ex-player flex h-full w-full flex-col">
      <div className="relative min-h-0 flex-1">
        <svg
          viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Animated explainer, scene ${scene + 1} of ${count}`}
          className="absolute inset-0 size-full"
        >
          <StageDefs ids={ids} />
          <g key={`${run}-${scene}`} className="ex-scene">
            {current.elements.map((el, i) => (
              <StageElement key={i} el={el} ids={ids} />
            ))}
          </g>
        </svg>
      </div>

      <p aria-live="polite" className="mx-auto min-h-[2lh] max-w-[60ch] px-2 pt-3 text-center text-callout text-pretty text-white/85">
        <MathText text={current.caption} />
      </p>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={ended ? replay : () => setUserPaused((p) => !p)}
          aria-label={ended ? "Replay" : playing ? "Pause" : "Play"}
          className={controlButton}
        >
          {ended ? (
            <RotateCcw aria-hidden className="size-[18px]" />
          ) : playing ? (
            <Pause aria-hidden className="size-[18px]" fill="currentColor" strokeWidth={0} />
          ) : (
            <Play aria-hidden className="size-[18px] translate-x-px" fill="currentColor" strokeWidth={0} />
          )}
        </button>

        <ol className="flex flex-1 items-center gap-1.5" aria-label="Scenes">
          {script.scenes.map((s, i) => (
            <li key={i} className="flex-1">
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Scene ${i + 1} of ${count}`}
                aria-current={i === scene ? "step" : undefined}
                className="group flex h-6 w-full items-center rounded-full focus-visible:outline-2 focus-visible:outline-white/70"
              >
                <span className="relative h-1 w-full overflow-hidden rounded-full bg-white/20 transition-[height] duration-200 ease-spring group-hover:h-1.5">
                  {i < scene || (i === scene && ended) ? (
                    <span className="absolute inset-0 bg-white/85" />
                  ) : i === scene ? (
                    <span
                      key={run}
                      className="ex-progress absolute inset-0 origin-left bg-white/85"
                      style={{ animationDuration: `${s.duration}ms` }}
                      onAnimationEnd={onSceneEnd}
                    />
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ol>

        <span className="w-9 text-center text-footnote text-white/55 tabular-nums" aria-hidden>
          {scene + 1}/{count}
        </span>
      </div>
    </div>
  );
}
