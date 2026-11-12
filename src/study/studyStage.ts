/** Immersion / stage chrome: desktop Fullscreen zen, or mobile while a card is up. */
export function studyStage(opts: {
  mobile: boolean;
  hasCard: boolean;
  fullscreenZen: boolean;
}): boolean {
  return opts.fullscreenZen || (opts.mobile && opts.hasCard);
}
