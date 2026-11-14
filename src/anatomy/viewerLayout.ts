export function anatomyViewerMobile(mobile: boolean): {
  showRail: boolean;
  showSheetTriggers: boolean;
} {
  return {
    showRail: !mobile,
    showSheetTriggers: mobile,
  };
}
