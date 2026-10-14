// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { ApplicationFlowViewer } from "./ApplicationFlowViewer";
import { startApplication } from "../services/startApplication";
import { CATALOG, SEGMENTS } from "../data/productCatalog";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement, calls: { url: string; body: Record<string, unknown> }[], goodCode: string;
beforeEach(() => {
  calls = []; goodCode = "481516"; localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (u: string, init?: RequestInit) => {
    const url = String(u), body = init?.body ? JSON.parse(String(init.body)) : {}; calls.push({ url, body });
    if (url.endsWith("/api/otp/send")) return new Response(JSON.stringify({ success: true, demoCode: goodCode, data: { sent: true, demoCode: goodCode } }));
    if (url.endsWith("/api/otp/verify")) return new Response(JSON.stringify(body.code === goodCode ? { success: true } : { success: false, error: "Incorrect code" }));
    if (url.endsWith("/api/applications")) return new Response(JSON.stringify({ success: true, data: { id: "1", referenceNumber: "PER-2026-000123", accountNumber: "1049 2201 8870", status: "submitted" } }), { status: 201 });
    return new Response(JSON.stringify({ success: true }));
  }));
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

const wait = (ms = 30) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const render = async () => { await act(async () => { root.render(<ApplicationFlowViewer isOpen onClose={() => {}} />); }); };
const btn = (t: string) => [...host.querySelectorAll("button")].find((b) => b.textContent!.trim().startsWith(t)) as HTMLElement;
const click = async (t: string) => { const b = btn(t); if (!b) throw new Error("no button " + t); await act(async () => { b.click(); }); await wait(); };
const setv = async (id: string, v: string) => {
  const el = host.querySelector("#" + id) as HTMLInputElement | HTMLSelectElement; if (!el) throw new Error("no field " + id);
  const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, v); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
};
const heading = () => [...host.querySelectorAll("h1, h2")].pop()!.textContent;      // the step heading comes after the page title
const text = () => host.textContent!;
const fillPersonal = async (type = "Personal") => {
  await setv("a-type", type); await setv("a-acct", "Accounts"); await setv("a-clear", type === "Business" ? "Launch Business Account" : "Spark Account"); await setv("a-country", "South Africa");
  await setv("a-idn", "9001015009087"); await setv("a-fn", "thandi"); await setv("a-ln", "Mokoena"); await setv("a-em", "thandi@example.com"); await setv("a-cell", "0821234567"); await setv("a-addr", "12 Long Street, Cape Town");
};
const toDriver = async () => { await click("Start"); await click("New application"); await fillPersonal(); await click("Let's continue"); await click("Without facial"); await click("Let's continue"); };
const addFile = async (name: string) => {
  const fi = host.querySelector("input[type=file]") as HTMLInputElement;
  Object.defineProperty(fi, "files", { value: [new File(["x"], name, { type: "application/pdf" })], configurable: true });      // jsdom has no DataTransfer
  await act(async () => { fi.dispatchEvent(new Event("change", { bubbles: true })); });
};
const fillCode = async (c: string) => {
  for (let i = 0; i < 6; i++) {
    const el = host.querySelector(`[aria-label="Digit ${i + 1}"]`) as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, c[i]); el.dispatchEvent(new Event("input", { bubbles: true })); });
  }
};

describe("the application form that Start Now opens", () => {
  it("every Start Now asks the site to open it", () => {
    const heard = vi.fn(); window.addEventListener("vink:start-application", heard); startApplication(); window.removeEventListener("vink:start-application", heard);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("starts on the welcome card, then offers a new or a saved application and the main sign-in", async () => {
    await render(); expect(text()).toContain("Apply in a few simple steps."); expect(text()).not.toContain("VINK Application");      // the welcome card has no title
    await click("Start"); expect(btn("New application")).toBeTruthy(); expect(btn("Saved application")).toBeTruthy();
    const asked = vi.fn(); window.addEventListener("vink:open-login", asked); await click("Login"); window.removeEventListener("vink:open-login", asked); expect(asked).toHaveBeenCalledTimes(1);
  });

  it("asks for every required detail, with a message under each empty field", async () => {
    await render(); await click("Start"); await click("New application"); await click("Let's continue");
    for (const m of ["Select a category", "Select a product", "Select your country of birth", "Enter your identity number", "Enter your first name", "Enter your last name", "Enter a valid email address", "Enter a valid cell number", "Enter your residential address"]) expect(text()).toContain(m);
    expect(heading()).toBe("Register");
  });

  it("asks first for Personal, Business or Corporate, then the category (account, insurance, investment…), then the product of that category", async () => {
    await render(); await click("Start"); await click("New application");
    const opts = (id: string) => [...(host.querySelector("#" + id) as HTMLSelectElement).options].map((o) => o.text);
    const order = [...host.querySelectorAll("select")].map((x) => x.id).slice(0, 3); expect(order).toEqual(["a-type", "a-acct", "a-clear"]);
    expect(opts("a-type")).toEqual(["Personal", "Business", "Corporate"]);
    for (const seg of SEGMENTS) {
      await setv("a-type", seg);
      expect(opts("a-acct")).toEqual(["Account, investment, loan…", ...CATALOG[seg].map((g) => g.group)]);
      expect(opts("a-clear")).toEqual(["Choose a category first"]);
      for (const g of CATALOG[seg]) { await setv("a-acct", g.group); expect(opts("a-clear")).toEqual(["Choose a product", ...g.products]); }
    }
    expect(opts("a-acct")).not.toContain("Insurance");                                          // Corporate has no insurance
    await setv("a-type", "Personal"); expect(opts("a-acct")).toContain("Insurance");
    await setv("a-acct", "Insurance"); expect(opts("a-clear")).toEqual(["Choose a product", "Life Insurance", "Funeral Cover", "Vehicle Insurance"]);
    await setv("a-clear", "Funeral Cover"); await setv("a-acct", "Loans"); expect((host.querySelector("#a-clear") as HTMLSelectElement).value).toBe("");      // a new category clears the product
    await setv("a-type", "Corporate"); expect((host.querySelector("#a-acct") as HTMLSelectElement).value).toBe("");
  });

  it("takes a personal application through the camera choice, the driver details and the phone code, then submits it for real", async () => {
    await render(); await click("Start"); await click("New application"); await fillPersonal(); await click("Let's continue");
    expect(heading()).toBe("Permission to access your camera needed"); expect(text()).toContain("REF-");
    await click("Without facial"); expect(heading()).toBe("Help us to securely find out about you"); expect((host.querySelector("#a-fn") as HTMLInputElement).value).toBe("thandi");
    await click("Let's continue"); expect(heading()).toBe("Driver and vehicle details");
    await click("Let's continue"); expect(text()).toContain("Enter a valid phone number"); expect(text()).toContain("Upload at least one vehicle registration document");
    await setv("v-phone", "0821234567"); await setv("v-lic", "DL-778899"); await addFile("vehicle-registration.pdf");
    await click("Let's continue"); await wait(60);
    expect(heading()).toBe("Phone verification"); expect(text()).toContain("0821234567"); expect(text()).toContain("481516");        // the code is shown while no SMS service is connected
    await fillCode("481516"); await click("Verify now"); await wait(60);
    expect(text()).toContain("Congratulations"); expect(text()).toContain("PER-2026-000123"); expect(text()).toContain("1049 2201 8870");
    const sent = calls.find((c) => c.url.endsWith("/api/applications"))!.body as Record<string, unknown>;
    expect(sent).toMatchObject({ tier: "personal", applicantName: "thandi Mokoena", applicantEmail: "thandi@example.com", applicantPhone: "0821234567", accountTypeRequested: "Accounts: Spark Account" });
    expect(sent.tierData).toMatchObject({ phoneVerified: true, facialVerification: false, vehicleDocuments: ["vehicle-registration.pdf"] });
    expect(sent.tierData).not.toHaveProperty("selfie");                                                     // skipping facial verification sends no photo
    expect(localStorage.getItem("reg-draft")).toBeNull();
    await click("Ok"); expect(text()).toContain("Hi Thandi"); expect(text()).toContain("coming soon");
  });

  it("a business application has the business step, with a registration number, documents and a director", async () => {
    await render(); await click("Start"); await click("New application"); await fillPersonal("Business"); await click("Let's continue"); await click("Without facial"); await click("Let's continue");
    expect(heading()).toBe("Business details");
    await click("Let's continue"); expect(text()).toContain("Enter the registered business name"); expect(text()).toContain("Upload at least one business document");
    await click("Add director"); await click("Let's continue"); expect(text()).toContain("Enter ID or passport number");
    await setv("b-name", "Mokoena Taxis"); await setv("b-reg", "2018/079316/07"); await addFile("certificate.pdf");
    const id = (host.querySelector("[id^=d][id$=-fn]") as HTMLInputElement).id.replace("-fn", "");
    await setv(id + "-fn", "Sipho"); await setv(id + "-ln", "Dlamini"); await setv(id + "-id", "8001015009087"); await setv(id + "-em", "sipho@example.com");
    await click("Let's continue"); expect(heading()).toBe("Driver and vehicle details");
  });

  it("locks the application after three wrong codes", async () => {
    await render(); await toDriver(); await setv("v-phone", "0821234567"); await setv("v-lic", "DL-1"); await addFile("a.pdf"); await click("Let's continue"); await wait(60);
    for (let n = 0; n < 2; n++) { await fillCode("000000"); await click("Verify now"); await wait(60); expect(text()).toContain("Incorrect code"); }
    expect(text()).toContain("1 / 3 attempts"); expect(text()).toContain("locked for 24 hours");
    await fillCode("000000"); await click("Verify now"); await wait(60);
    expect(text()).toContain("locked after 3 failed attempts"); expect(Number(localStorage.getItem("vink-apply-lock"))).toBeGreaterThan(Date.now());
  });

  it("a saved application comes back with its application number and ID number", async () => {
    await render(); await click("Start"); await click("New application"); await fillPersonal(); await click("Let's continue");
    const ref = (text().match(/REF-\d{6}/) ?? [""])[0]; expect(ref).toBeTruthy();
    act(() => root.unmount()); root = createRoot(host); await render();
    await click("Start"); await click("Saved application");
    await setv("s-ref", ref); await setv("s-id", "123"); await click("Let's continue"); expect(text()).toContain("No saved application matches those details");
    await setv("s-id", "9001015009087"); await click("Let's continue"); expect(heading()).toBe("Register"); expect((host.querySelector("#a-fn") as HTMLInputElement).value).toBe("thandi");
  });
  it("a selfie taken in the camera step is sent with the application, and not sent when the applicant skips facial verification", async () => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });                // no camera here: the step offers a photo from the device
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ translate: vi.fn(), scale: vi.fn(), drawImage: vi.fn() })) as never;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/jpeg;base64,SELFIE");
    vi.stubGlobal("Image", class { onload: (() => void) | null = null; onerror: (() => void) | null = null; naturalWidth = 800; naturalHeight = 600; set src(_v: string) { setTimeout(() => this.onload?.(), 0); } });
    await render(); await click("Start"); await click("New application"); await fillPersonal(); await click("Let's continue");
    expect(text()).toContain("sent with your application");
    await click("Continue with facial verification"); expect(heading()).toBe("Take a selfie");
    const input = host.querySelector("#selfie-file") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File(["x"], "me.jpg", { type: "image/jpeg" })], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); }); await wait(60);
    await click("Use this photo"); expect(heading()).toBe("Help us to securely find out about you");
    await click("Let's continue"); await setv("v-phone", "0821234567"); await setv("v-lic", "DL-1"); await addFile("a.pdf"); await click("Let's continue"); await wait(60);
    await fillCode("481516"); await click("Verify now"); await wait(60);
    const sent = calls.find((c) => c.url.endsWith("/api/applications"))!.body as { tierData: Record<string, unknown> };
    expect(sent.tierData).toMatchObject({ facialVerification: true, selfie: "data:image/jpeg;base64,SELFIE" });
  });
});
