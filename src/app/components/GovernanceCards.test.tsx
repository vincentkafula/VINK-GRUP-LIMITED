// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { PersonGrid } from "./GovernanceCards";
import { InvestorRelationsViewer } from "./InvestorRelationsViewer";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement;
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

describe("the board and management cards", () => {
  it("show a portrait frame (a silhouette until there is a photo), a tag, the name, the role and a count", async () => {
    await act(async () => { root.render(<PersonGrid groupKey="t" noun="members of the Board" people={[{ name: "Ada Lovelace", role: "Chair", tag: "Chair" }, { name: "Grace Hopper", role: "Director", photo: "https://example.com/g.jpg", note: "Cape Town" }]} />); });
    await wait(200);
    expect(host.querySelector(".vg-stat")!.textContent).toBe("2members of the Board");
    const cards = [...host.querySelectorAll(".vg-card")]; expect(cards).toHaveLength(2); expect(cards.every((c) => c.classList.contains("in"))).toBe(true);
    expect(cards[0].querySelector("svg")).toBeTruthy(); expect(cards[0].querySelector("img")).toBeNull(); expect(cards[0].querySelector(".vg-tag")!.textContent).toBe("Chair"); expect(cards[0].querySelector("h3")!.textContent).toBe("Ada Lovelace");
    expect(cards[1].querySelector("img")!.getAttribute("src")).toBe("https://example.com/g.jpg"); expect(cards[1].querySelector("svg")).toBeNull(); expect(cards[1].querySelector(".vg-note")!.textContent).toBe("Cape Town"); expect(cards[1].querySelector(".vg-tag")).toBeNull();
  });
  it("are used for the Board of Directors and the Management Team on the Investor Relations page, with a count on each tab", async () => {
    await act(async () => { root.render(<InvestorRelationsViewer isOpen onClose={() => {}} />); }); await wait(600);
    const tab = (t: string) => [...host.querySelectorAll("button")].find((b) => b.textContent!.startsWith(t))!;
    expect(tab("Board of Directors").textContent).toContain("6"); expect(tab("Management").textContent).toContain("8");
    expect(host.querySelectorAll(".vg-card")).toHaveLength(6); expect(host.querySelector(".vg-stat")!.textContent).toContain("members of the Board"); expect(host.querySelector(".vg-card .vg-tag")!.textContent).toBe("Founder");
    await act(async () => { (tab("Management") as HTMLElement).click(); }); await wait(700);
    expect(host.querySelectorAll(".vg-card")).toHaveLength(8); expect(host.querySelector(".vg-stat")!.textContent).toContain("members of the Management Team");
  });
});
