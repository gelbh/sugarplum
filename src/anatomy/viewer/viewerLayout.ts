export function anatomyViewerMobile(mobile: boolean): {
  showRail: boolean;
  showSheetTriggers: boolean;
} {
  return {
    showRail: !mobile,
    showSheetTriggers: mobile,
  };
}

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
