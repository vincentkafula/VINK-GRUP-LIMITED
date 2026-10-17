import { render, screen, fireEvent, within, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { toast } from "sonner";
import { SponsorshipApplicationViewer } from "./SponsorshipApplicationViewer";
import { saveDraft, loadDraft, initialState } from "./sponsorshipForm";

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const el = (id: string) => document.getElementById(`sf-${id}`) as HTMLInputElement;
const type = (id: string, value: string) => fireEvent.change(el(id), { target: { value } });
const next = () => fireEvent.click(screen.getByRole("button", { name: /^(Continue|Submit application)/ }));
const heading = () => document.querySelector(".sf-card h2")!.textContent;
const pdf = (name: string) => new File(["%PDF-1.4 a test"], name, { type: "application/pdf" });

const stepOne = () => {
  type("orgType", "ngo"); type("applicantName", "Thandi Nkosi"); type("organisation", "Khayelitsha Youth Hub"); type("contactPerson", "Thandi Nkosi");
  type("email", "thandi@example.com"); type("phone", "082 000 0000"); type("physicalAddress", "12 Lingelethu Road, Khayelitsha"); type("province", "Western Cape"); type("city", "Cape Town");
  fireEvent.click(screen.getByLabelText("No"));
};
const stepTwo = () => fireEvent.click(screen.getByLabelText("Youth empowerment and entrepreneurship"));
const stepThree = () => {
  type("projectTitle", "Township Entrepreneurs Bootcamp");
  type("executiveSummary", "A twelve week business skills programme for sixty young people in Khayelitsha, ending with a pitch day judged by local business owners.");
  type("background", "Youth unemployment in our area is above sixty percent. Our objective is to give young people practical skills to start small businesses.");
  type("problem", "Young people leave school without any practical business training and have no access to mentors or start-up capital.");
  type("targetAudience", "Unemployed young people aged 18 to 25"); type("geographicArea", "Khayelitsha, Cape Town"); type("beneficiaries", "60");
  type("startDate", day(20)); type("endDate", day(80));
  type("implementationPlan", "Weeks one to four cover basics. Weeks five to eight are mentored practice. Weeks nine to twelve are pitch preparation and the pitch day.");
  type("outcomes", "Sixty participants complete the programme and at least twenty start a business within six months, tracked by follow-up surveys.");
  type("whyVink", "VINK serves the taxi industry that our participants and their families depend on every day.");
  type("alignment", "The programme supports township economic development, one of VINK's published focus areas.");
};
const stepFour = () => {
  type("totalBudget", "80000"); type("amountRequested", "50000"); type("ownContribution", "20000"); type("otherSponsorsAmount", "10000"); type("otherSponsorsNotes", "Local ward committee");
  fireEvent.change(screen.getByLabelText("Line 1 description"), { target: { value: "Facilitators" } }); fireEvent.change(screen.getByLabelText("Line 1 amount"), { target: { value: "45000" } });
  fireEvent.click(screen.getByRole("button", { name: "Add a line" }));
  fireEvent.change(screen.getByLabelText("Line 2 description"), { target: { value: "Venue and pitch day" } }); fireEvent.change(screen.getByLabelText("Line 2 amount"), { target: { value: "35000" } });
  type("financialControls", "Two signatories on every payment, monthly reports to the board, and an independent examiner.");
};
const stepFive = () => {
  fireEvent.click(screen.getByLabelText("Brand logo placement")); fireEvent.click(screen.getByLabelText("Social media exposure"));
  type("benefitsValue", "Logo on all materials and about four thousand people reached through our social channels.");
};
const stepSix = async () => {
  for (const [label, name] of [["Detailed sponsorship proposal", "proposal.pdf"], ["NGO or charity registration certificate", "npo.pdf"], ["Project budget and financial statements", "budget.pdf"]]) {
    fireEvent.change(screen.getByLabelText(`Choose files for: ${label}`), { target: { files: [pdf(name)] } });
    await screen.findByText(name);
  }
};
const consent = () => { for (const k of ["accuracy", "authorised", "terms", "processing"]) fireEvent.click(el(`consent-${k}`)); };
const walkTo = async (step: number) => {
  const fills = [stepOne, stepTwo, stepThree, stepFour, stepFive];
  for (let n = 1; n < step; n++) { if (n === 6) await stepSix(); else fills[n - 1](); next(); }
};
const open = (extra: Partial<React.ComponentProps<typeof SponsorshipApplicationViewer>> = {}) => render(<SponsorshipApplicationViewer isOpen onClose={() => {}} {...extra} />);

beforeEach(() => { localStorage.clear(); vi.mocked(toast.error).mockClear(); vi.mocked(toast.success).mockClear(); });
afterEach(() => cleanup());

describe("the sponsorship application form", () => {
  it("opens on the first of seven steps, with the whole path shown", () => {
    open();
    expect(heading()).toBe("Applicant and organisation details");
    const steps = within(screen.getByRole("list", { name: "Application steps" })).getAllByRole("listitem");
    expect(steps.map((l) => l.textContent)).toEqual(["1Organisation", "2Category", "3Proposal", "4Budget", "5Benefits", "6Documents", "7Submit"]);
    expect(steps[0].getAttribute("aria-current")).toBe("step");
    expect(screen.getAllByText(/Step 1 of 7/).length).toBeGreaterThanOrEqual(1);
  });

  it("does not shout while someone types: problems appear only when they press Continue, then name every one", () => {
    open();
    expect(document.querySelector(".sf-err")).toBeNull();
    next();
    expect(heading()).toBe("Applicant and organisation details");               // it did not move on
    expect(document.querySelector(".sf-summary")!.textContent).toMatch(/answers need your attention/);
    expect(document.getElementById("sf-email-err")!.textContent).toBe("Enter a valid email address");
    expect(el("email").getAttribute("aria-invalid")).toBe("true"); expect(el("email").getAttribute("aria-describedby")).toBe("sf-email-err");
    type("email", "thandi@example.com");                                          // fixing it clears it straight away
    expect(document.getElementById("sf-email-err")).toBeNull();
  });

  it("asks only for what applies to the kind of organisation", () => {
    open();
    type("orgType", "company"); expect(screen.getByLabelText(/Company registration number/)).toBeTruthy();
    type("orgType", "individual"); expect(screen.getByLabelText("Organisation (if any)")).toBeTruthy();
    type("orgType", "ngo");
    expect(el("postalAddress")).toBeNull(); fireEvent.click(screen.getByLabelText(/postal address is the same/)); expect(el("postalAddress")).toBeTruthy();
    expect(el("taxNumber")).toBeNull(); fireEvent.click(screen.getByLabelText(/Yes, we are tax-exempt/)); expect(el("taxNumber")).toBeTruthy();
  });

  it("offers South Africa's nine provinces by their official names, and a region list for other countries", () => {
    open();
    const names = () => [...el("province").querySelectorAll("option")].map((o) => o.textContent).filter((t) => t !== "Choose…");
    expect(names()).toEqual(["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "Northern Cape", "North West", "Western Cape"]);
    type("country", "Zambia"); expect(names()).toContain("Lusaka");
  });

  it("moves through the steps, keeps what was typed when going back, and lets completed steps be revisited", async () => {
    open();
    stepOne(); next();
    expect(heading()).toBe("Sponsorship category");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(el("applicantName").value).toBe("Thandi Nkosi"); expect(el("province").value).toBe("Western Cape");
    next(); stepTwo(); next();
    expect(heading()).toBe("Project or sponsorship proposal");
    fireEvent.click(screen.getByRole("button", { name: "Step 1: Organisation (completed)" }));
    expect(heading()).toBe("Applicant and organisation details");
    expect((screen.getByRole("button", { name: "Step 6: Documents" }) as HTMLButtonElement).disabled).toBe(true);    // steps not reached yet cannot be jumped to
  });

  it("shows the money adding up as people type, in words as well as colour", async () => {
    open(); await walkTo(4);
    expect(heading()).toBe("Sponsorship amount and budget");
    type("totalBudget", "80000"); type("amountRequested", "50000"); type("ownContribution", "20000"); type("otherSponsorsAmount", "10000");
    fireEvent.change(screen.getByLabelText("Line 1 description"), { target: { value: "Everything" } }); fireEvent.change(screen.getByLabelText("Line 1 amount"), { target: { value: "70000" } });
    const f = document.querySelector(".sf-funding")!;
    expect(f.textContent).toMatch(/Breakdown: ZAR 70[\s\u00a0,]?000 of ZAR 80[\s\u00a0,]?000 total budget \(ZAR 10[\s\u00a0,]?000 still to allocate\)/);
    expect(f.textContent).toMatch(/it covers the budget/);
    fireEvent.change(screen.getByLabelText("Line 1 amount"), { target: { value: "80000" } });
    expect(f.textContent).toMatch(/it matches/);
    type("amountRequested", "60000");
    expect(f.textContent).toMatch(/more than the budget/);
    next(); expect(document.getElementById("sf-amountRequested-err")!.textContent).toMatch(/more than the total project budget/);
  });

  it("applies the rand limits to a request made in rand, with the figures in the message", async () => {
    open(); await walkTo(4);
    type("totalBudget", "4000"); type("amountRequested", "4000"); type("ownContribution", "0"); type("otherSponsorsAmount", "0");
    fireEvent.change(screen.getByLabelText("Line 1 description"), { target: { value: "All" } }); fireEvent.change(screen.getByLabelText("Line 1 amount"), { target: { value: "4000" } });
    type("financialControls", "Two signatories on every payment, monthly reports to the board, and an independent examiner.");
    next(); expect(document.getElementById("sf-amountRequested-err")!.textContent).toMatch(/between R5.?000 and R500.?000/);
  });

  it("asks for the documents this applicant needs, which depend on who they are and what for", async () => {
    open(); await walkTo(6);
    expect(heading()).toBe("Supporting documents");
    const titles = () => [...document.querySelectorAll(".sf-doc__title")].map((t) => t.textContent);
    expect(titles().filter((t) => /Required$/.test(t!)).map((t) => t!.replace("Required", ""))).toEqual(["Detailed sponsorship proposal", "NGO or charity registration certificate", "Project budget and financial statements"]);
    expect(screen.getByText("0 of 3 required documents attached")).toBeTruthy();
    expect(titles().filter((t) => /Optional$/.test(t!)).length).toBe(7);
  });

  it("checks each file as it is chosen: type, size and emptiness, and lets it be removed", async () => {
    open(); await walkTo(6);
    const input = screen.getByLabelText("Choose files for: Detailed sponsorship proposal");
    fireEvent.change(input, { target: { files: [new File(["x"], "notes.txt")] } });
    expect(await screen.findByText(/"notes.txt" is not an accepted file type/)).toBeTruthy();
    fireEvent.change(input, { target: { files: [new File([], "empty.pdf")] } });
    expect(await screen.findByText(/"empty.pdf" is empty/)).toBeTruthy();
    fireEvent.change(input, { target: { files: [pdf("proposal.pdf")] } });
    expect(await screen.findByText("proposal.pdf")).toBeTruthy(); expect(screen.getByText("1 of 3 required documents attached")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove proposal.pdf" }));
    expect(screen.queryByText("proposal.pdf")).toBeNull(); expect(screen.getByText("0 of 3 required documents attached")).toBeTruthy();
  });

  it("will not go past the documents step until every required document is attached, and says which are missing", async () => {
    open(); await walkTo(6);
    next();
    expect(heading()).toBe("Supporting documents");
    expect(document.getElementById("sf-documents")).toBeTruthy();
    expect(document.querySelector(".sf-summary")!.textContent).toMatch(/Attach the required documents: Detailed sponsorship proposal; NGO or charity registration certificate; Project budget and financial statements/);
  });

  it("drops a document that is no longer asked for when the applicant changes the organisation type", async () => {
    open(); await walkTo(6);
    await stepSix();
    expect(screen.getByText("npo.pdf")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Step 1: Organisation (completed)" }));
    type("orgType", "individual");                                               // an individual is not asked for a registration certificate
    fireEvent.click(screen.getByRole("button", { name: /^Step 6/ }));
    expect(screen.queryByText("npo.pdf")).toBeNull(); expect(screen.getByText("proposal.pdf")).toBeTruthy();
  });

  it("shows a review of the answers with a way back to each part, and needs the four confirmations", async () => {
    open(); await walkTo(7);
    expect(heading()).toBe("Declaration and submission");
    const review = document.querySelector(".sf-review")!;
    expect(review.textContent).toContain("Khayelitsha Youth Hub"); expect(review.textContent).toContain("Township Entrepreneurs Bootcamp"); expect(review.textContent).toMatch(/ZAR 50[\s\u00a0,]?000/);
    expect(review.textContent).toContain("proposal.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Edit project" }));
    expect(heading()).toBe("Project or sponsorship proposal");
    fireEvent.click(screen.getByRole("button", { name: "Step 7: Submit" }));
    next();
    expect(document.querySelector(".sf-summary")!.textContent).toMatch(/4 answers need your attention/);
    expect(document.getElementById("sf-consent-terms-err")!.textContent).toBe("This confirmation is required");
  });

  it("sends the application, shows the reference number, and clears the saved draft", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { ref: "SP-ABC234", message: "ok" } }), { status: 201 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const onTrack = vi.fn();
    open({ onTrack }); await walkTo(7); consent(); next();
    expect(await screen.findByRole("heading", { name: "Application received" })).toBeTruthy();
    expect(screen.getByText("SP-ABC234")).toBeTruthy(); expect(screen.getByText("thandi@example.com")).toBeTruthy();
    expect(screen.getByText(/VINK reviews applications on a quarterly basis/)).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/sponsorship$/); expect(init.method).toBe("POST");
    const fd = init.body as FormData; const data = JSON.parse(String(fd.get("data")));
    expect(data).toMatchObject({ orgType: "ngo", category: "youth", amountRequested: 50000, totalBudget: 80000, benefits: ["logo", "social"], consent: { accuracy: true, authorised: true, terms: true, processing: true } });
    expect(fd.getAll("doc_proposal")).toHaveLength(1); expect((fd.get("doc_registration") as File).name).toBe("npo.pdf"); expect(fd.has("doc_programme")).toBe(false);
    expect(loadDraft()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Follow this application/ }));
    expect(onTrack).toHaveBeenCalledWith("SP-ABC234", "thandi@example.com");
  });

  it("takes a person to the answer the server did not accept, keeps everything they typed, and says why", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ success: false, error: "Please correct the highlighted answers", fields: { email: "Enter a valid email address" } }), { status: 400 })) as unknown as typeof fetch;
    open(); await walkTo(7); consent(); next();
    await waitFor(() => expect(heading()).toBe("Applicant and organisation details"));
    expect(document.getElementById("sf-email-err")!.textContent).toBe("Enter a valid email address");
    expect(el("applicantName").value).toBe("Thandi Nkosi");
    expect(toast.error).toHaveBeenCalledWith("Please correct the highlighted answers");
  });

  it("never loses the application when sending fails: it says so, offers the email address, and stays on the last step with every answer", async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError("network down"); }) as unknown as typeof fetch;
    open(); await walkTo(7); consent(); next();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(String(vi.mocked(toast.error).mock.calls[0][0])).toMatch(/sponsorships@vink\.co\.za/);
    expect(heading()).toBe("Declaration and submission");
    expect(screen.queryByRole("heading", { name: "Application received" })).toBeNull();
    expect((screen.getByRole("button", { name: /Submit application/ }) as HTMLButtonElement).disabled).toBe(false);   // they can try again
    expect(loadDraft()?.state.projectTitle).toBe("Township Entrepreneurs Bootcamp");
  });

  it("says so when the server refuses for a reason that is not an answer, such as too many applications", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ success: false, error: "You have sent several applications already. Please try again later, or email us." }), { status: 429 })) as unknown as typeof fetch;
    open(); await walkTo(7); consent(); next();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("You have sent several applications already. Please try again later, or email us."));
    expect(heading()).toBe("Declaration and submission");
  });

  it("keeps a draft on this device and offers it next time, without the documents or the confirmations", () => {
    saveDraft({ ...initialState(), applicantName: "Thandi Nkosi", organisation: "Youth Hub", projectTitle: "Bootcamp" }, 3);
    open();
    const banner = screen.getByRole("region", { name: "Saved draft" });
    expect(banner.textContent).toMatch(/saved draft from/); expect(banner.textContent).toMatch(/Documents are not saved/);
    fireEvent.click(within(banner).getByRole("button", { name: "Continue my draft" }));
    expect(heading()).toBe("Project or sponsorship proposal"); expect(screen.queryByRole("region", { name: "Saved draft" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Step 1: Organisation (completed)" }));
    expect(el("applicantName").value).toBe("Thandi Nkosi");
  });
  it("does not delete the draft it has just offered (the autosave must not save the blank form over it)", async () => {
    saveDraft({ ...initialState(), applicantName: "Thandi Nkosi", organisation: "Youth Hub" }, 2);
    open();
    await new Promise((r) => setTimeout(r, 900));                                 // longer than the autosave delay
    expect(loadDraft()?.state.applicantName).toBe("Thandi Nkosi");
    expect(screen.getByRole("region", { name: "Saved draft" })).toBeTruthy();
  });
  it("lets a person start again, which deletes the draft", () => {
    saveDraft({ ...initialState(), applicantName: "Thandi Nkosi", organisation: "Youth Hub" }, 2);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Start again" }));
    expect(loadDraft()).toBeNull(); expect(screen.queryByRole("region", { name: "Saved draft" })).toBeNull(); expect(el("applicantName").value).toBe("");
  });
  it("saves what is typed as it goes", async () => {
    open(); type("applicantName", "Thandi Nkosi"); type("organisation", "Youth Hub");
    await waitFor(() => expect(loadDraft()?.state.applicantName).toBe("Thandi Nkosi"), { timeout: 2000 });
  });

  it("hides the trap field from people and screen readers", async () => {
    open(); await walkTo(7);
    const trap = document.querySelector(".sf-hp")!;
    expect(trap.getAttribute("aria-hidden")).toBe("true"); expect(trap.querySelector("input")!.getAttribute("tabindex")).toBe("-1");
  });

  it("goes back to the Sponsorship page from the breadcrumb and Cancel", () => {
    const onClose = vi.fn(); open({ onClose });
    fireEvent.click(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("button", { name: "Sponsorship" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("renders nothing while closed", () => {
    const { container } = render(<SponsorshipApplicationViewer isOpen={false} onClose={() => {}} />);
    expect(container.innerHTML).toBe("");
  });
});
