import type { Page } from "../kit";
import { online } from "./online";
import { account } from "./account";
import { banking } from "./banking";
import { payments } from "./payments";
import { credit } from "./credit";

/** Every dashboard page by id, e.g. "o/tx" (online), "p/devices" (card machines), "b/cards" (banking). */
export const PAGES: Record<string, Page> = { ...online, ...account, ...banking, ...payments, ...credit };
