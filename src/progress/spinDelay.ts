import { useEffect, useRef, useState } from "react";

export type SpinDelayOptions = { delay: number; minDuration: number };

type SpinDelay = {
  set: (active: boolean) => void;
  dispose: () => void;
};

/** Hide indicators for work shorter than `delay`; once shown, keep them up for `minDuration`. */
export function createSpinDelay(
  { delay, minDuration }: SpinDelayOptions,
  onChange: (visible: boolean) => void,
): SpinDelay {
  let active = false;
  let visible = false;
  let shownAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const show = () => {
    timer = undefined;
    visible = true;
    shownAt = Date.now();
    onChange(true);
  };
  const hide = () => {
    timer = undefined;
    visible = false;
    onChange(false);
  };

  return {
    set(next) {
      if (next === active) return;
      active = next;
      clear();
      if (active) {
        if (!visible) timer = setTimeout(show, delay);
        return;
      }
      if (!visible) return;
      const left = minDuration - (Date.now() - shownAt);
      if (left > 0) timer = setTimeout(hide, left);
      else hide();
    },
    dispose() {
      clear();
      active = false;
      if (visible) hide();
    },
  };
}

/** `value` while shown; through the minimum-visible tail, the last non-null value. */
export function useSpinDelay<T>(
  value: T | null,
  options: SpinDelayOptions,
): T | null {
  const [visible, setVisible] = useState(false);
  const [spin] = useState(() => createSpinDelay(options, setVisible));
  const last = useRef(value);
  useEffect(() => {
    if (value != null) last.current = value;
    spin.set(value != null);
  }, [spin, value]);
  useEffect(() => () => spin.dispose(), [spin]);
  // Read only once `value` is null; effects write it after commit, so every render of one commit agrees.
  return visible ? (value ?? last.current) : null;
}
