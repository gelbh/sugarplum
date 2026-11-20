import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { lifecycleModel } from "./lifecycle";
import { isShortcutTarget } from "../hub/keys";
import type { DatasetFields } from "../types";

export type LifecycleSwimCtx = {
  fields: DatasetFields;
  stages: DatasetFields["lifecycleStages"];
  index: number;
  setIndex: (i: number | ((prev: number) => number)) => void;
  setPlaying: (playing: boolean) => void;
  current: DatasetFields["lifecycleStages"][number];
};

const PLAY_STEP_MS = 1200;

export function useLifecycleSwimlane(fields: DatasetFields) {
  const model = useMemo(() => lifecycleModel(fields), [fields]);
  const stages = fields.lifecycleStages;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, stages.length - 1)));
  }, [stages.length]);
  const playRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const last = stages.length - 1;

  useEffect(() => {
    if (!playing) return;
    if (index >= last) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIndex((i) => i + 1), PLAY_STEP_MS);
    return () => clearTimeout(t);
  }, [playing, index, last]);

  const step = (delta: number) => {
    setPlaying(false);
    setIndex((i) => Math.min(last, Math.max(0, i + delta)));
  };
  const togglePlay = () => {
    if (playing) return setPlaying(false);
    if (index >= last) setIndex(0);
    setPlaying(true);
  };

  const onKey = useEffectEvent((ev: KeyboardEvent) => {
    if (!isShortcutTarget(ev)) return;
    // Not from the tab strip, and not from a modal (the rail drawer) covering the board.
    if (
      ev.target instanceof Element &&
      ev.target.closest('[role="tablist"], .MuiModal-root')
    )
      return;
    if (ev.key === "ArrowRight") step(1);
    else if (ev.key === "ArrowLeft") step(-1);
    else if (ev.key === " ") {
      // Space keeps its page-scroll meaning outside the board; a focused button clicks itself.
      if (!(ev.target instanceof Node) || !rootRef.current?.contains(ev.target))
        return;
      if (ev.target instanceof Element && ev.target.closest("button,a")) return;
      togglePlay();
    } else return;
    ev.preventDefault();
  });
  useEffect(() => {
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // On a phone the board scrolls sideways; keep the marker's column in view.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const track = scroller?.querySelector<HTMLElement>("[data-track]");
    if (!scroller || !track || scroller.scrollWidth <= scroller.clientWidth)
      return;
    const col = track.clientWidth / Math.max(1, stages.length);
    const label = track.offsetLeft - scroller.offsetLeft;
    const left = index * col;
    const visible = scroller.clientWidth - label;
    if (
      left >= scroller.scrollLeft &&
      left + col <= scroller.scrollLeft + visible
    )
      return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    scroller.scrollTo({
      left: Math.max(0, left - col),
      behavior: reduce ? "auto" : "smooth",
    });
  }, [index, stages.length]);

  const empty = stages.length === 0;
  const current = stages[index] as
    | DatasetFields["lifecycleStages"][number]
    | undefined;
  const ctx: LifecycleSwimCtx | null =
    empty || !current
      ? null
      : {
          fields,
          stages,
          index,
          setIndex,
          setPlaying,
          current,
        };

  return {
    model,
    stages,
    index,
    setIndex,
    playing,
    setPlaying,
    step,
    togglePlay,
    rootRef,
    playRef,
    scrollerRef,
    current,
    ctx,
    empty,
    last,
  };
}
