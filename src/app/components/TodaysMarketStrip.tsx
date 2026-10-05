import { Fragment } from "react";
import nfc from "../../imports/market/nfc.webp";
import qr from "../../imports/market/qr.webp";
import balance from "../../imports/market/balance.webp";
import segmented from "../../imports/market/segmented.webp";
import gps from "../../imports/market/gps.webp";
import emvco from "../../imports/market/emvco.webp";
import paypass from "../../imports/market/paypass.webp";
import contactless from "../../imports/market/contactless.webp";

const CHANNELS = [
  { img: nfc, label: "NFC Card payment" },
  { img: qr, label: "QR-code" },
  { img: balance, label: "Balance Inquiry" },
  { img: segmented, label: "Segmented Charge" },
  { img: gps, label: "GPS Location" },
];

/**
 * "Today's Market" band shown under the hero while the multi-ticketing validator slide is on screen:
 * the five channels one validator combines, and the payment standards it follows. Collapses smoothly (grid rows) so the slideshow doesn't jump.
 */
export function TodaysMarketStrip({ open }: { open: boolean }) {
  return (
    <div
      className="grid transition-[grid-template-rows,opacity] duration-500 ease-out motion-reduce:transition-none"
      style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
      aria-hidden={!open}
      // inert keeps the collapsed band out of the tab order and the accessibility tree
      {...(!open ? ({ inert: "" } as Record<string, string>) : {})}
    >
      <div className="overflow-hidden">
        <section aria-labelledby="todays-market" className="mx-auto max-w-6xl px-6 pb-10 pt-2">
          <div className="rounded-3xl bg-white px-5 py-7 text-center shadow-xl md:px-8" style={{ color: "#14161d" }}>
            <h2 id="todays-market" className="font-display text-2xl font-bold md:text-3xl" style={{ color: "#0c1a3a" }}>Today’s Market</h2>
            <p className="mt-1 text-sm font-medium md:text-base">Multi-ticketing validator</p>
            <p className="text-sm md:text-base" style={{ color: "#4a4f5c" }}>Multi-Channel integrated in the One-system.</p>

            <ul className="mt-6 flex flex-wrap items-start justify-center gap-x-2 gap-y-5 md:gap-x-4">
              {CHANNELS.map((c, i) => (
                <Fragment key={c.label}>
                  <li className="flex w-[104px] flex-col items-center gap-2 md:w-[128px]">
                    <span className="flex size-[92px] items-center justify-center rounded-2xl border bg-white md:size-[112px]" style={{ borderColor: "#ecd2d4" }}>
                      <img src={c.img} alt="" loading="lazy" decoding="async" className="size-[68px] object-contain md:size-[84px]" draggable={false} />
                    </span>
                    <span className="text-xs font-medium md:text-sm">{c.label}</span>
                  </li>
                  {i < CHANNELS.length - 1 && (
                    <li aria-hidden="true" className="hidden select-none self-start pt-[30px] text-2xl font-bold md:block md:pt-[40px]" style={{ color: "#C9A84C" }}>+</li>
                  )}
                </Fragment>
              ))}
            </ul>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t pt-5" style={{ borderColor: "#eee" }}>
              <img src={emvco} alt="EMVCo" loading="lazy" decoding="async" className="h-9 w-auto object-contain" draggable={false} />
              <img src={paypass} alt="Mastercard PayPass" loading="lazy" decoding="async" className="h-11 w-auto object-contain" draggable={false} />
              <img src={contactless} alt="Contactless payment" loading="lazy" decoding="async" className="h-10 w-auto object-contain" draggable={false} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
