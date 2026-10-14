export const CATEGORIES = ["adult", "student", "senior", "child", "staff"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Stop { id: number; name: string; zone: number; seq: number }

export type RouteFare =
  | { mode: "flat"; flatAmount: number }
  | {
      mode: "zone";
      /** Fare between two zones (either direction). Missing pairs fall back to maxFare. */
      zoneFares: { from: number; to: number; amount: number }[];
      /** Charged for a trip that was never tapped out; also the balance a passenger needs to tap in. */
      maxFare: number;
      minFare: number;
    };

export interface Route {
  id: number;
  code: string;
  name: string;
  operatorId: number;
  stops: Stop[];
  fare: RouteFare;
  /** The same card cannot tap the same place again within this many seconds. */
  apbSeconds: number;
  /** A trip with no tap-out after this many seconds is abandoned and charged maxFare. */
  tapOutTimeoutSeconds: number;
}

/** Changes the base fare during part of the day: 8000 = 20% off (off-peak), 12000 = 20% more (peak). First matching rule wins. */
export interface TimeRule { id: number; name: string; days: number[]; startMinute: number; endMinute: number; multiplierBp: number }
export interface DiscountRule { category: Category; discountBp: number }

export interface FareTable {
  version: number;
  currency: "ZAR";
  /** Local time offset used for time-of-day rules (South Africa: +120). */
  utcOffsetMinutes: number;
  routes: Route[];
  timeRules: TimeRule[];
  discounts: DiscountRule[];
  publishedAt: string;
}
