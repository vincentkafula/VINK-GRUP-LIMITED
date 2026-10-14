import type { FareTable } from "./types";

/**
 * A realistic starter table for a minibus network (rand, South African time). Used for the seed data, the simulator and the tests;
 * a real operator replaces it from the dashboard.
 *   Route 1  "Town - Airport"      zone fares, 4 zones, R8 to R28
 *   Route 2  "CBD Loop"            flat R12
 */
export function sampleFareTable(version = 1): FareTable {
  return {
    version,
    currency: "ZAR",
    utcOffsetMinutes: 120,
    publishedAt: "2026-01-01T00:00:00.000Z",
    routes: [
      {
        id: 1, code: "R1", name: "Town - Airport", operatorId: 1, apbSeconds: 120, tapOutTimeoutSeconds: 4 * 3600,
        stops: [
          { id: 101, name: "Central Station", zone: 1, seq: 1 }, { id: 102, name: "Market Street", zone: 1, seq: 2 },
          { id: 103, name: "Industrial Park", zone: 2, seq: 3 }, { id: 104, name: "Mall", zone: 3, seq: 4 }, { id: 105, name: "Airport", zone: 4, seq: 5 },
        ],
        fare: {
          mode: "zone", minFare: 800, maxFare: 2800,
          zoneFares: [
            { from: 1, to: 1, amount: 800 }, { from: 1, to: 2, amount: 1200 }, { from: 1, to: 3, amount: 1800 }, { from: 1, to: 4, amount: 2800 },
            { from: 2, to: 2, amount: 800 }, { from: 2, to: 3, amount: 1200 }, { from: 2, to: 4, amount: 2000 },
            { from: 3, to: 3, amount: 800 }, { from: 3, to: 4, amount: 1200 }, { from: 4, to: 4, amount: 800 },
          ],
        },
      },
      {
        id: 2, code: "R2", name: "CBD Loop", operatorId: 1, apbSeconds: 90, tapOutTimeoutSeconds: 3600,
        stops: [{ id: 201, name: "Loop", zone: 1, seq: 1 }],
        fare: { mode: "flat", flatAmount: 1200 },
      },
    ],
    // weekdays 06:00-08:59 and 16:00-18:29 cost 20% more; weekends and 10:00-14:59 weekdays cost 20% less
    timeRules: [
      { id: 1, name: "Morning peak", days: [1, 2, 3, 4, 5], startMinute: 360, endMinute: 540, multiplierBp: 12000 },
      { id: 2, name: "Evening peak", days: [1, 2, 3, 4, 5], startMinute: 960, endMinute: 1110, multiplierBp: 12000 },
      { id: 3, name: "Midday off-peak", days: [1, 2, 3, 4, 5], startMinute: 600, endMinute: 900, multiplierBp: 8000 },
      { id: 4, name: "Weekend", days: [0, 6], startMinute: 0, endMinute: 1440, multiplierBp: 8000 },
    ],
    discounts: [
      { category: "adult", discountBp: 0 }, { category: "student", discountBp: 2500 }, { category: "senior", discountBp: 5000 },
      { category: "child", discountBp: 5000 }, { category: "staff", discountBp: 10000 },
    ],
  };
}

/** Demo cards used by the seed data and the simulator. The simulator personalises these UIDs with these balances so both sides agree. */
export const SAMPLE_CARDS = [
  { uid: "04a1b2c3d4e5f6", holder: "Thandi Mokoena", category: "adult" as const, balance: 10000 },
  { uid: "04a1b2c3d4e5f7", holder: "Sipho Dlamini (student)", category: "student" as const, balance: 5000 },
  { uid: "04a1b2c3d4e5f8", holder: "Mama Joyce (senior)", category: "senior" as const, balance: 3000 },
  { uid: "04a1b2c3d4e5f9", holder: "Low balance demo", category: "adult" as const, balance: 500 },
];
