/** Account FSRS weight-optimize status (API + Settings). */
export type FsrsOptimizeStatus = {
  pending: boolean;
  lastOptimizedAt: string | null;
  reviewCount: number;
  hasCustomW: boolean;
  eligible: boolean;
};
