import { vi } from "vitest";

/**
 * Tests that use fixed dates (a trip on 5 October, a quote that expires a minute later) also depend on the database's own now(), which is the real clock.
 * Pinning Date keeps them correct whatever day they run on. Only Date is faked: timers and promises behave normally.
 */
export const pinClock = (iso: string) => { vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true }); vi.setSystemTime(new Date(iso)); };
export const unpinClock = () => { vi.useRealTimers(); };
