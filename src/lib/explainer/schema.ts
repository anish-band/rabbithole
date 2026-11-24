import { z } from "zod";

/**
 * Explainer scripts: what the left-hand stage plays for a paper.
 *
 * `scenes` is our own 3Blue1Brown-style animation format (written by Claude in
 * #9, rendered by `components/explainer/player.tsx`). `video` leaves room for
 * externally generated videos (e.g. GLM/alphaXiv) without touching the player
 * contract. Keep changes backward compatible: bump `version` if not.
 *
 * Coordinates live in a 160 × 90 canvas (16:9), origin top-left. Times are
 * milliseconds from the start of the scene.
 */
export const CANVAS = { width: 160, height: 90 } as const;

export const COLORS = ["blue", "teal", "green", "yellow", "red", "white", "muted"] as const;
const Color = z.enum(COLORS);
const X = z.number().min(-20).max(CANVAS.width + 20);
const Y = z.number().min(-20).max(CANVAS.height + 20);
const Point = z.tuple([X, Y]);
const Ms = z.number().min(0).max(20_000);

const Enter = z.object({
  at: Ms.default(0),
  /** fade: opacity; draw: stroke traces on; grow: scales from its centre; rise: fades up 4 units. */
  effect: z.enum(["fade", "draw", "grow", "rise"]).default("fade"),
  duration: z.number().min(100).max(4000).default(700),
});

const Move = z.object({ at: Ms, dx: z.number().min(-160).max(160), dy: z.number().min(-90).max(90), duration: z.number().min(100).max(4000).default(800) });

const Base = {
  enter: Enter.optional(),
  /** Leave at this time (fade out). */
  exitAt: Ms.optional(),
  move: Move.optional(),
};

const Size = z.enum(["sm", "md", "lg"]).default("md");

export const ElementSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), x: X, y: Y, text: z.string().min(1).max(80), size: Size, color: Color.default("white"), align: z.enum(["start", "middle", "end"]).default("middle"), ...Base }),
  z.object({ kind: z.literal("math"), x: X, y: Y, tex: z.string().min(1).max(200), size: Size, color: Color.default("white"), ...Base }),
  z.object({ kind: z.literal("circle"), x: X, y: Y, r: z.number().min(0.3).max(45), color: Color.default("blue"), fill: z.boolean().default(false), ...Base }),
  z.object({ kind: z.literal("rect"), x: X, y: Y, w: z.number().min(0.5).max(180), h: z.number().min(0.5).max(110), color: Color.default("blue"), fill: z.boolean().default(false), ...Base }),
  z.object({ kind: z.literal("line"), from: Point, to: Point, color: Color.default("white"), arrow: z.boolean().default(false), dashed: z.boolean().default(false), ...Base }),
  z.object({ kind: z.literal("path"), points: z.array(Point).min(2).max(200), closed: z.boolean().default(false), smooth: z.boolean().default(false), color: Color.default("yellow"), ...Base }),
  z.object({ kind: z.literal("dots"), points: z.array(Point).min(1).max(200), r: z.number().min(0.3).max(4).default(1), color: Color.default("white"), ...Base }),
  z.object({ kind: z.literal("axes"), x: X, y: Y, w: z.number().min(10).max(160), h: z.number().min(10).max(90), xLabel: z.string().max(30).optional(), yLabel: z.string().max(30).optional(), ...Base }),
  z.object({ kind: z.literal("highlight"), x: X, y: Y, w: z.number().min(1).max(160), h: z.number().min(1).max(90), color: Color.default("yellow"), ...Base }),
]);

export const SceneSchema = z.object({
  /** One or two sentences shown under the animation. Inline `$…$` math is rendered. */
  caption: z.string().min(1).max(220),
  duration: z.number().min(2000).max(20_000),
  elements: z.array(ElementSchema).max(40),
});

export const ScenesExplainerSchema = z.object({
  type: z.literal("scenes"),
  version: z.literal(1),
  scenes: z.array(SceneSchema).min(1).max(8),
});

export const VideoExplainerSchema = z.object({
  type: z.literal("video"),
  url: z.url({ protocol: /^https$/ }),
  poster: z.url({ protocol: /^https$/ }).optional(),
  captionsUrl: z.url({ protocol: /^https$/ }).optional(),
});

export const ExplainerSchema = z.discriminatedUnion("type", [ScenesExplainerSchema, VideoExplainerSchema]);

export type ExplainerElement = z.output<typeof ElementSchema>;
export type Scene = z.output<typeof SceneSchema>;
export type ScenesExplainer = z.output<typeof ScenesExplainerSchema>;
export type Explainer = z.output<typeof ExplainerSchema>;
export type Color = (typeof COLORS)[number];

/** Validate untrusted input (model output, cache files). Returns null when invalid. */
export function parseExplainer(input: unknown): Explainer | null {
  const result = ExplainerSchema.safeParse(input);
  return result.success ? result.data : null;
}
