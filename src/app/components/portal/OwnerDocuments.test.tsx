/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DocumentFiles, shrinkImage, MAX_UPLOAD_BYTES, SHRINK_ABOVE_BYTES } from "./OwnerDocuments";

type Reply = { status?: number; body: unknown; file?: boolean } | "network";
let routes: (method: string, path: string, init?: RequestInit) => Reply | undefined, calls: { method: string; path: string; headers: Record<string, string>; body: unknown }[];
const P = "/api/portal/owner";
const F = (o: any) => ({ id: "f1", kind: "letter_of_recommendation", filename: "Letter.pdf", mime: "application/pdf", sizeBytes: 250_000, vehicleId: null, scanStatus: "unscanned", scanDetail: null, uploadedOn: "2026-10-30", ...o });
const FILES = [F({}), F({ id: "f2", kind: "membership_certificate", filename: "Certificate.jpg", mime: "image/jpeg", sizeBytes: 1_800_000, scanStatus: "clean", uploadedOn: "2026-10-31" }), F({ id: "f3", kind: "roadworthy", filename: "Roadworthy.pdf", sizeBytes: 90 })];
const usage = (o: any = {}) => ({ files: 3, bytes: 2_000_000, maxFiles: 100, maxBytes: 104857600, maxFileBytes: 5242880, storageAvailable: true, ...o });
const PAPERS = ["letter_of_recommendation", "membership_certificate", "membership_card"];

beforeEach(() => {
  calls = []; URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn();
  routes = (m, p) => {
    if (m === "GET" && p.startsWith(`${P}/files?`) || (m === "GET" && p === `${P}/files`)) return { body: { success: true, files: FILES, usage: usage() } };
    if (m === "GET" && /\/files\/f\d$/.test(p)) return { body: "x", file: true };
    if (m === "POST" && p.startsWith(`${P}/files?`)) return { status: 201, body: { success: true, id: "new", duplicate: false, scanStatus: "unscanned", filename: "x.pdf" } };
    if (m === "DELETE") return { body: { success: true, id: "f1" } };
    return undefined;
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, ""), method = init?.method ?? "GET"; calls.push({ method, path, headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body });
    const r = routes(method, path, init); if (r === "network") throw new TypeError("Failed to fetch"); if (!r) return new Response(JSON.stringify({ success: false, error: "unexpected " + method + " " + path }), { status: 500 });
    if (r.file) return new Response("x", { status: 200, headers: { "content-type": "application/pdf" } }); return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const posts = () => calls.filter((c) => c.method === "POST");
const pickFile = (label: string, file: File) => fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } });
const pdf = (n = 100, name = "new.pdf") => new File([new Uint8Array(n)], name, { type: "application/pdf" });
const show = async (props: any = {}) => { render(<DocumentFiles title="Attach your papers" kinds={PAPERS} {...props} />); await screen.findByText("Letter.pdf", { selector: "b" }); };

describe("the files already attached", () => {
  it("lists only the kinds asked for, with the name, what it is, its size, when it was added and whether an antivirus checked it", async () => {
    await show(); expect(screen.queryByText("Roadworthy.pdf", { selector: "b" })).toBeNull(); expect(screen.getByText("Letter.pdf", { selector: "b" }).closest("li")).toHaveTextContent("Letter.pdf · Letter of recommendation · 244 KB · added 2026-10-30 · Not checked by an antivirus"); expect(screen.getByText("Certificate.jpg", { selector: "b" }).closest("li")).toHaveTextContent("Membership certificate · 1.7 MB · added 2026-10-31 · Checked by an antivirus");
  });
  it("shows a small file as at least 1 KB, says when nothing is attached, and asks only for this vehicle's files when given one", async () => {
    cleanup(); render(<DocumentFiles title="For the vehicle" kinds={["roadworthy"]} vehicleId="v1" />); expect(await screen.findByText("Roadworthy.pdf", { selector: "b" })).toBeInTheDocument(); expect(screen.getByText("Roadworthy.pdf", { selector: "b" }).closest("li")).toHaveTextContent("1 KB"); expect(calls[0].path).toBe(`${P}/files?vehicleId=v1`); cleanup();
    routes = ((o) => (m: string, p: string, i?: RequestInit) => (m === "GET" ? { body: { success: true, files: [], usage: usage({ files: 0 }) } } : o(m, p, i)))(routes); render(<DocumentFiles title="Empty" kinds={PAPERS} />); expect(await screen.findByText("No files attached yet.")).toBeInTheDocument();
  });
  it("says so, and offers no way to add a file, when document storage is not switched on", async () => {
    routes = ((o) => (m: string, p: string, i?: RequestInit) => (m === "GET" ? { body: { success: true, files: [], usage: usage({ storageAvailable: false }) } } : o(m, p, i)))(routes); render(<DocumentFiles title="No storage" kinds={PAPERS} />); expect(await screen.findByRole("alert")).toHaveTextContent("Document storage is not switched on yet"); expect(screen.queryByLabelText("Choose a file for No storage")).toBeNull();
  });
});

describe("adding a file", () => {
  it("sends the file itself with its own type, its name and what it is, and shows it was saved and reloads the list", async () => {
    await show(); const f = pdf(500, "My letter.pdf"); pickFile("Choose a file for Attach your papers", f); expect(await screen.findByText("Saved.")).toBeInTheDocument();
    const p = posts()[0]; expect(p.path).toBe(`${P}/files?filename=My+letter.pdf&kind=letter_of_recommendation`); expect(p.headers["Content-Type"]).toBe("application/pdf"); expect(p.body).toBe(f); expect(calls.filter((c) => c.method === "GET" && c.path.startsWith(`${P}/files`)).length).toBe(2);
  });
  it("sends what the person says it is, and the vehicle when there is one", async () => {
    cleanup(); render(<DocumentFiles title="For the vehicle" kinds={["roadworthy", "insurance"]} vehicleId="v1" />); await screen.findByText("Roadworthy.pdf", { selector: "b" }); fireEvent.change(screen.getByLabelText("Kind of file for For the vehicle"), { target: { value: "insurance" } }); pickFile("Choose a file for For the vehicle", pdf(50, "policy.pdf"));
    await waitFor(() => expect(posts()).toHaveLength(1)); expect(posts()[0].path).toBe(`${P}/files?filename=policy.pdf&kind=insurance&vehicleId=v1`);
  });
  it("lets a photo be taken with the camera, as an image", async () => { await show(); const cam = screen.getByLabelText("Take a photo for Attach your papers"); expect(cam).toHaveAttribute("capture", "environment"); expect(cam).toHaveAttribute("accept", "image/*"); pickFile("Take a photo for Attach your papers", new File([new Uint8Array(900)], "IMG_1.jpg", { type: "image/jpeg" })); await waitFor(() => expect(posts()).toHaveLength(1)); expect(posts()[0].headers["Content-Type"]).toBe("image/jpeg"); });
  it("only offers the kinds of file that can be stored, and does not ask what it is when there is only one kind", async () => {
    await show(); expect(screen.getByLabelText("Choose a file for Attach your papers")).toHaveAttribute("accept", "application/pdf,image/jpeg,image/png"); cleanup(); render(<DocumentFiles title="One kind" kinds={["letter_of_recommendation"]} />); await screen.findByText("Letter.pdf", { selector: "b" }); expect(screen.queryByLabelText("Kind of file for One kind")).toBeNull();
  });
  it("refuses a file that is not a PDF, JPEG or PNG, and one over 5 MB, without sending anything", async () => {
    await show(); pickFile("Choose a file for Attach your papers", new File(["hi"], "notes.txt", { type: "text/plain" })); expect(await screen.findByText("Only PDF, JPEG or PNG files can be added.")).toBeInTheDocument(); pickFile("Choose a file for Attach your papers", new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "huge.pdf", { type: "application/pdf" })); expect(await screen.findByText(/That file is too large \(5\.0 MB\)\. The most is 5 MB/)).toBeInTheDocument(); expect(posts()).toEqual([]);
  });
  it("shows the server's reason when a file is refused, and tells the person plainly when it is already stored or there is no connection", async () => {
    routes = ((o) => (m: string, p: string, i?: RequestInit) => (m === "POST" ? { status: 422, body: { success: false, error: "That file was refused and not stored: Eicar-Test-Signature found" } } : o(m, p, i)))(routes); await show(); pickFile("Choose a file for Attach your papers", pdf()); expect(await screen.findByText("That file was refused and not stored: Eicar-Test-Signature found")).toBeInTheDocument();
    routes = ((o) => (m: string, p: string, i?: RequestInit) => (m === "POST" ? { status: 200, body: { success: true, id: "f1", duplicate: true } } : o(m, p, i)))(routes); pickFile("Choose a file for Attach your papers", pdf(60, "same.pdf")); expect(await screen.findByText("You already have this file.")).toBeInTheDocument();
    routes = ((o) => (m: string, p: string, i?: RequestInit) => (m === "POST" ? "network" : o(m, p, i)))(routes); pickFile("Choose a file for Attach your papers", pdf(70, "offline.pdf")); expect(await screen.findByText(/We could not reach the server\. Check your connection and try again: a file needs a connection/)).toBeInTheDocument();
  });
  it("tells the person the limits and what it does for their data and privacy", async () => { await show({ hint: "Keep it current." }); expect(screen.getByText(/PDF, JPEG or PNG, up to 5 MB\. Keep it current\. Big photos are made smaller on your phone first, to save your data\. Files are kept private and encrypted\./)).toBeInTheDocument(); });
});

describe("downloading and deleting", () => {
  it("downloads a file", async () => { await show(); fireEvent.click(screen.getByRole("button", { name: "Download Letter.pdf" })); await waitFor(() => expect(calls.at(-1)!.path).toBe(`${P}/files/f1`)); });
  it("erases a file only after a second, deliberate click, naming the file", async () => {
    await show(); fireEvent.click(screen.getByRole("button", { name: "Delete Letter.pdf" })); expect(calls.filter((c) => c.method === "DELETE")).toEqual([]); fireEvent.click(screen.getByRole("button", { name: "Yes, erase Letter.pdf" })); await waitFor(() => expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(1)); expect(calls.find((c) => c.method === "DELETE")!.path).toBe(`${P}/files/f1`);
  });
  it("shows the server's reason when a delete is refused", async () => {
    routes = ((o) => (m: string, p: string, i?: RequestInit) => (m === "DELETE" ? { status: 404, body: { success: false, error: "That file was not found" } } : o(m, p, i)))(routes); await show(); fireEvent.click(screen.getByRole("button", { name: "Delete Letter.pdf" })); fireEvent.click(screen.getByRole("button", { name: "Yes, erase Letter.pdf" })); expect(await screen.findByText("That file was not found")).toBeInTheDocument();
  });
});

describe("making a photo smaller on the phone", () => {
  const big = (type = "image/jpeg", name = "photo.jpg") => new File([new Uint8Array(SHRINK_ABOVE_BYTES + 1000)], name, { type });
  const stubCanvas = (outBytes = 400_000) => { let dim: [number, number] | null = null; vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 4000, height: 3000 }))); vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) { return { drawImage: () => { dim = [this.width, this.height]; } } as any; }); vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb: any, type?: string) => cb(new Blob([new Uint8Array(outBytes)], { type })) as any); return () => dim; };
  it("leaves a PDF, a small photo, or anything it cannot shrink exactly as it is", async () => { const p = pdf(SHRINK_ABOVE_BYTES + 10); expect(await shrinkImage(p)).toBe(p); const small = new File([new Uint8Array(1000)], "s.jpg", { type: "image/jpeg" }); expect(await shrinkImage(small)).toBe(small); const b = big(); expect(await shrinkImage(b)).toBe(b); /* no createImageBitmap in this browser */ });
  it("shrinks a big photo to 1 600 pixels on its longest side, as a smaller JPEG with a .jpg name", async () => {
    const dim = stubCanvas(); const out = await shrinkImage(big("image/png", "Roadworthy.PNG")); expect(dim()).toEqual([1600, 1200]); expect(out).toMatchObject({ name: "Roadworthy.jpg", type: "image/jpeg", size: 400_000 });
  });
  it("sends the smaller photo, not the original, when adding one", async () => { stubCanvas(300_000); await show(); pickFile("Take a photo for Attach your papers", big()); await waitFor(() => expect(posts()).toHaveLength(1)); expect((posts()[0].body as File).size).toBe(300_000); expect(posts()[0].headers["Content-Type"]).toBe("image/jpeg"); });
  it("keeps the original when shrinking would not make it smaller, or fails", async () => {
    stubCanvas(SHRINK_ABOVE_BYTES + 5000); const a = big(); expect(await shrinkImage(a)).toBe(a); vi.restoreAllMocks(); vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new Error("cannot decode"); })); const b = big(); expect(await shrinkImage(b)).toBe(b);
    vi.restoreAllMocks(); stubCanvas(); vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null); const c = big(); expect(await shrinkImage(c)).toBe(c);
  });
});
