import type { CSSProperties, ReactNode } from "react";
import { MathText } from "@/components/math-text";
import { CANVAS, type Color, type ExplainerElement } from "@/lib/explainer/schema";

/** Stage palette: dark canvas, a few saturated 3Blue1Brown-like hues. Solid colours only. */
export const PALETTE: Record<Color, string> = {
  blue: "#58c4dd",
  teal: "#5cd0b3",
  green: "#83c167",
  yellow: "#f4d345",
  red: "#fc6255",
  white: "#ece9e4",
  muted: "rgb(236 233 228 / 0.5)",
};

const TEXT_SIZE = { sm: 3.6, md: 4.8, lg: 6.4 } as const;
const MATH_SIZE = { sm: 3.4, md: 4.6, lg: 6.2 } as const;
const STROKE = 0.55;

const ENTER_KEYFRAMES = { fade: "ex-fade", draw: "ex-draw", grow: "ex-grow", rise: "ex-rise" } as const;
const STROKED = new Set(["line", "path", "rect", "circle", "axes", "highlight"]);

/** Inline CSS animations for an element; all timings come from the script. */
function animationStyle(el: ExplainerElement): CSSProperties {
  const enter = el.enter ?? { at: 0, effect: "fade" as const, duration: 500 };
  // "draw" only makes sense for outlines; filled shapes, dots and text fade instead.
  const drawable =
    enter.effect === "draw" && STROKED.has(el.kind) && !("fill" in el && el.fill) && !(el.kind === "line" && el.dashed);
  const effect = enter.effect === "draw" && !drawable ? "fade" : enter.effect;
  const parts = [`${ENTER_KEYFRAMES[effect]} ${enter.duration}ms var(--ease-spring) ${enter.at}ms both`];
  if (el.exitAt !== undefined) parts.push(`ex-out 400ms ease ${el.exitAt}ms forwards`);
  return { animation: parts.join(", ") };
}

/** Stage units → CSS length: SVG user units are px; the HTML layer scales with its container width. */
type Unit = (n: number) => string;
const svgUnit: Unit = (n) => `${n}px`;
const htmlUnit: Unit = (n) => `calc(${n} * 100cqw / ${CANVAS.width})`;

function moveStyle(el: ExplainerElement, unit: Unit = svgUnit): CSSProperties | undefined {
  if (!el.move) return undefined;
  const { at, dx, dy, duration } = el.move;
  return {
    ["--dx" as string]: unit(dx),
    ["--dy" as string]: unit(dy),
    animation: `ex-move ${duration}ms var(--ease-spring) ${at}ms both`,
  };
}

type Pt = [number, number];

/** Catmull-Rom spline through the points, as cubic Béziers. */
function smoothPath(points: Pt[], closed: boolean) {
  const p = closed ? [points.at(-1)!, ...points, points[0], points[1]] : [points[0], ...points, points.at(-1)!];
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(2)},${c1[1].toFixed(2)} ${c2[0].toFixed(2)},${c2[1].toFixed(2)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

const polyline = (points: Pt[], closed: boolean) => `M${points.map((p) => p.join(",")).join(" L")}${closed ? " Z" : ""}`;

function shape(el: ExplainerElement, ids: string): ReactNode {
  switch (el.kind) {
    case "text":
      return (
        <text
          x={el.x}
          y={el.y}
          fill={PALETTE[el.color]}
          fontSize={TEXT_SIZE[el.size]}
          fontWeight={500}
          textAnchor={el.align}
          dominantBaseline="middle"
          letterSpacing="-0.01em"
        >
          {el.text}
        </text>
      );
    case "math":
      return null; // drawn in the HTML layer (MathLayer), not inside the SVG
    case "circle":
      return (
        <circle
          cx={el.x}
          cy={el.y}
          r={el.r}
          pathLength={1}
          stroke={PALETTE[el.color]}
          strokeWidth={STROKE}
          fill={el.fill ? PALETTE[el.color] : "none"}
        />
      );
    case "rect":
      return (
        <rect
          x={el.x}
          y={el.y}
          width={el.w}
          height={el.h}
          rx={0.8}
          pathLength={1}
          stroke={PALETTE[el.color]}
          strokeWidth={STROKE}
          fill={el.fill ? PALETTE[el.color] : "none"}
          fillOpacity={el.fill ? 0.25 : undefined}
        />
      );
    case "highlight":
      return (
        <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={1.5} pathLength={1} stroke={PALETTE[el.color]} strokeWidth={STROKE * 1.4} fill="none" />
      );
    case "line":
      return (
        <path
          d={`M${el.from.join(",")} L${el.to.join(",")}`}
          // Dashed lines keep their dash pattern, so they fade in instead of drawing.
          pathLength={el.dashed ? undefined : 1}
          stroke={PALETTE[el.color]}
          strokeWidth={STROKE}
          strokeDasharray={el.dashed ? "1.6 1.2" : undefined}
          markerEnd={el.arrow ? `url(#${ids}-arrow-${el.color})` : undefined}
          fill="none"
        />
      );
    case "path":
      return (
        <path
          d={el.smooth ? smoothPath(el.points, el.closed) : polyline(el.points, el.closed)}
          pathLength={1}
          stroke={PALETTE[el.color]}
          strokeWidth={STROKE}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
        />
      );
    case "dots":
      return (
        <g fill={PALETTE[el.color]}>
          {el.points.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={el.r} />
          ))}
        </g>
      );
    case "axes": {
      const muted = PALETTE.muted;
      return (
        <g stroke={muted} strokeWidth={STROKE} fill="none">
          <path d={`M${el.x},${el.y} L${el.x + el.w},${el.y}`} pathLength={1} markerEnd={`url(#${ids}-arrow-muted)`} />
          <path d={`M${el.x},${el.y} L${el.x},${el.y - el.h}`} pathLength={1} markerEnd={`url(#${ids}-arrow-muted)`} />
          {el.xLabel ? (
            <text x={el.x + el.w} y={el.y + 4} fontSize={3} fill={muted} stroke="none" textAnchor="end">
              {el.xLabel}
            </text>
          ) : null}
          {el.yLabel ? (
            // Above the arrow, reading rightwards: a label left of the axis ran off the canvas.
            <text x={el.x + 2} y={Math.max(3, el.y - el.h - 2.5)} fontSize={3} fill={muted} stroke="none" textAnchor="start">
              {el.yLabel}
            </text>
          ) : null}
        </g>
      );
    }
  }
}

/**
 * One element with its enter/exit animation, wrapped in an outer group for
 * `move`. `ids` prefixes marker references so several players can share a page.
 */
export function StageElement({ el, ids }: { el: ExplainerElement; ids: string }) {
  return (
    <g style={moveStyle(el)}>
      <g className="ex-el" style={animationStyle(el)}>
        {shape(el, ids)}
      </g>
    </g>
  );
}

/**
 * Formulas live in an HTML layer laid exactly over the SVG instead of in a
 * <foreignObject>: WebKit doesn't apply the viewBox scale to foreignObject
 * content under animated ancestors, so Safari drew them tiny in a corner.
 * Positions and sizes use container units, so 1 stage unit = 100cqw / 160.
 */
export function MathLayer({ elements }: { elements: ExplainerElement[] }) {
  return (
    <>
      {elements.map((el, i) =>
        el.kind === "math" ? (
          <div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${(el.x / CANVAS.width) * 100}%`, top: `${(el.y / CANVAS.height) * 100}%` }}
          >
            <div style={moveStyle(el, htmlUnit)}>
              <div className="ex-math" style={{ ...animationStyle(el), fontSize: htmlUnit(MATH_SIZE[el.size]), color: PALETTE[el.color] }}>
                <MathText text={`$${el.tex}$`} />
              </div>
            </div>
          </div>
        ) : null,
      )}
    </>
  );
}

/** Arrowhead markers, one per colour (markers can't inherit the stroke colour). */
export function StageDefs({ ids }: { ids: string }) {
  return (
    <defs>
      {Object.entries(PALETTE).map(([name, color]) => (
        <marker
          key={name}
          id={`${ids}-arrow-${name}`}
          viewBox="0 0 6 6"
          refX="5"
          refY="3"
          markerWidth="4"
          markerHeight="4"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill={color} />
        </marker>
      ))}
    </defs>
  );
}
