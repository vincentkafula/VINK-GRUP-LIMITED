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
  const openGovernance = async () => {
    await act(async () => { root.render(<InvestorRelationsViewer isOpen onClose={() => {}} />); }); await wait(300);
    await act(async () => { ([...host.querySelectorAll(".cta button")].find((b) => b.textContent!.startsWith("Corporate governance")) as HTMLElement).click(); }); await wait(100);
  };
  it("show the ten members of the Board and the fifteen of the Executive Committee on the Investor Relations page, with the right people, tags and counts", async () => {
    await openGovernance(); await wait(900);
    const tab = (t: string) => [...host.querySelectorAll('[role="tab"]')].find((b) => b.textContent!.startsWith(t))!;
    expect(tab("Board of Directors").textContent).toContain("10"); expect(tab("Executive Committee").textContent).toContain("15"); expect(tab("Responsibilities")).toBeTruthy();
    let names = [...host.querySelectorAll(".vg-card h3")].map((h) => h.textContent);
    expect(names).toEqual(["Professor Oliver Saasa", "Regina Mulenga", "Cecilia Zimba", "David Musunga", "Deepak Malik", "Leslie Horne", "Michael Mbulo", "Musata Ndhlovu", "Owen Silavwe", "Robin Miller"]);
    expect(host.querySelector(".vg-stat")!.textContent).toBe("10members of the Board"); expect(host.querySelector(".vg-card .vg-tag")!.textContent).toBe("Chair"); expect(host.querySelectorAll(".vg-tag")).toHaveLength(1);
    expect([...host.querySelectorAll(".vg-role")].map((r) => r.textContent).slice(0, 3)).toEqual(["Chairperson", "Vice Chairperson", "Non-Executive Director"]);
    expect(host.textContent).toContain("retains full and effective control of the bank and monitors the Executive Management Team");
    await act(async () => { (tab("Executive Committee") as HTMLElement).click(); }); await wait(1100);
    names = [...host.querySelectorAll(".vg-card h3")].map((h) => h.textContent);
    expect(names).toHaveLength(15); expect(names[0]).toBe("Mukwandi Chibesakunda"); expect(names[4]).toBe("Kaluba Gloria Kaulung\u2019ombe-Inampasa"); expect(names[14]).toBe("Eletina Phiri Bbuku");
    expect(host.querySelector(".vg-stat")!.textContent).toBe("15members of the Executive Committee"); expect(host.querySelector(".vg-tag")!.textContent).toBe("CEO"); expect(host.querySelector(".vg-note")!.textContent).toBe("*Non-Board Member");
    expect(host.querySelectorAll(".vg-role")[0].textContent).toBe("Chief Executive Officer*"); expect(host.textContent).toContain("responsible for the day-to-day management of the bank");
  });
  it("say what the Board and the Executive Committee are responsible for, in their own words", async () => {
    await openGovernance();
    await act(async () => { ([...host.querySelectorAll('[role="tab"]')].find((b) => b.textContent!.startsWith("Responsibilities")) as HTMLElement).click(); }); await wait(100);
    const t = host.textContent!; for (const x of ["Full and effective control", "Direction and strategy", "Prudent management of risk", "Day-to-day management", "Executing the strategy"]) expect(t).toContain(x);
    expect(t).not.toContain("King IV"); expect(host.querySelectorAll(".vg-card")).toHaveLength(0);
  });
});
