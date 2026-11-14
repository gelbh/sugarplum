/** Layout flags for anatomy viewer breakpoint split (spec lock 5A). */
export function anatomyViewerMobile(mobile: boolean): {
  showRail: boolean;
  showSheetTriggers: boolean;
} {
  return {
    showRail: !mobile,
    showSheetTriggers: mobile,
  };
}
