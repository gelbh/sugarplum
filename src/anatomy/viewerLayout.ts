export function anatomyViewerMobile(mobile: boolean): {
  showRail: boolean;
  showSheetTriggers: boolean;
} {
  return {
    showRail: !mobile,
    showSheetTriggers: mobile,
  };
}

/** Clip chrome split for mobile sheet vs desktop bar. */
export function anatomyClipChrome(
  mobile: boolean,
  hasClips: boolean,
): {
  showClipBar: boolean;
  showClipsTrigger: boolean;
} {
  return {
    showClipBar: !mobile && hasClips,
    showClipsTrigger: mobile && hasClips,
  };
}
