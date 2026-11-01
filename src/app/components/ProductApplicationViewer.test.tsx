import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

vi.mock("../services/applicationsApi", () => ({ applicationsApi: { submit: vi.fn() } }));
vi.mock("./ApplicationIdentityStep", () => ({ ApplicationIdentityStep: (p: { refNo: string; email?: string }) => <div data-testid="identity-step" data-ref={p.refNo} data-email={p.email} /> }));
import { applicationsApi } from "../services/applicationsApi";
import { ProductApplicationViewer } from "./ProductApplicationViewer";
import type { ProductKind } from "../data/productApplications";

const submit = vi.mocked(applicationsApi.submit);
const mount = (kind: ProductKind = "insurance", o: { initialProduct?: string; onClose?: () => void; isOpen?: boolean } = {}) => render(<ProductApplicationViewer isOpen={o.isOpen ?? true} onClose={o.onClose ?? vi.fn()} kind={kind} initialProduct={o.initialProduct} />);
const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = (name: RegExp | string) => fireEvent.click(screen.getByRole("button", { name }));
const aboutYou = () => { type(/First name/, "Thandi"); type(/Surname/, "Nkosi"); type(/Email address/, "thandi@example.com"); type(/Mobile number/, "+27 82 000 0000"); type(/Date of birth/, "1990-05-17"); };
beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); submit.mockReset(); });
afterEach(() => cleanup());

describe("choosing what to apply for", () => {
  it("offers the three insurance products, says plainly that this is not cover, and will not go on until one is chosen", () => {
    mount(); expect(screen.getByRole("dialog", { name: "Insurance application" })).toBeTruthy();
    for (const n of ["Life Insurance", "Funeral Cover", "Vehicle Insurance"]) expect(screen.getByRole("radio", { name: new RegExp(n) })).toBeTruthy();
    expect(screen.getByText(/does not give you cover/)).toBeTruthy(); expect((screen.getByRole("button", { name: /Continue/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Funeral Cover/ })); expect((screen.getByRole("button", { name: /Continue/ }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("offers the six personal loans, and says it is an application and not an offer", () => {
    mount("personalLoan"); for (const n of ["LifeAdvance", "FlexiLoan", "HorizonLoan", "SwiftCash", "DreamFund", "ElevateLoan"]) expect(screen.getByRole("radio", { name: new RegExp(n) })).toBeTruthy(); expect(screen.getByText(/not an offer/)).toBeTruthy();
  });
  it("starts at the next step when the visitor already chose a product, and Back shows that choice", () => {
    mount("insurance", { initialProduct: "Vehicle Insurance" }); expect(screen.getByLabelText(/First name/)).toBeTruthy(); expect(screen.getByText("Vehicle Insurance")).toBeTruthy();       // straight to "About you"
    press(/Back/); expect((screen.getByRole("radio", { name: /Vehicle Insurance/ }) as HTMLInputElement).checked).toBe(true);
  });
  it("ignores a product name it does not offer", () => { mount("insurance", { initialProduct: "Pet Insurance" }); expect(screen.getByRole("radio", { name: /Life Insurance/ })).toBeTruthy(); });
});

describe("telling us about yourself", () => {
  beforeEach(() => { mount("insurance", { initialProduct: "Life Insurance" }); });
  it("stops with a message beside each missing answer, and puts the cursor on the first", () => {
    press(/Continue/); expect(screen.getAllByRole("alert").length).toBe(5); expect(document.activeElement?.id).toBe("pa-firstName"); expect(screen.getByLabelText(/First name/).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText(/First name/)).toBeTruthy();                                                        // still on this step
  });
  it("clears a message as soon as the answer is corrected, and checks the email, number and age", () => {
    aboutYou(); type(/Email address/, "nope"); type(/Mobile number/, "abc"); type(/Date of birth/, "2015-01-01"); press(/Continue/);
    const msgs = screen.getAllByRole("alert").map((a) => a.textContent); expect(msgs).toEqual(expect.arrayContaining(["Enter a valid email address.", "Enter a valid mobile number.", "You must be 18 or older to apply."]));
    type(/Email address/, "thandi@example.com"); expect(screen.queryByText("Enter a valid email address.")).toBeNull();
  });
  it("goes on to the details once everything is valid", () => { aboutYou(); press(/Continue/); expect(screen.getByText("Life Insurance: the details")).toBeTruthy(); expect(screen.getByLabelText(/How much cover/)).toBeTruthy(); });
});

describe("the details differ by product", () => {
  it("asks about the family for funeral cover and about the car for vehicle insurance", () => {
    for (const [product, expected, absent] of [["Funeral Cover", /Children to cover/, /Registration number/], ["Vehicle Insurance", /Registration number/, /Children to cover/]] as const) {
      mount("insurance", { initialProduct: product }); aboutYou(); press(/Continue/); expect(screen.getByLabelText(expected)).toBeTruthy(); expect(screen.queryByLabelText(absent)).toBeNull(); cleanup();
    }
  });
  it("holds a loan to its limits and asks for an employer only of someone who works", () => {
    mount("personalLoan", { initialProduct: "FlexiLoan" }); aboutYou(); press(/Continue/);
    expect(screen.queryByLabelText(/Employer or business name/)).toBeNull(); type(/Employment status/, "employed"); expect(screen.getByLabelText(/Employer or business name/)).toBeTruthy(); type(/Employment status/, "student"); expect(screen.queryByLabelText(/Employer or business name/)).toBeNull();
    type(/How much do you need/, "500"); press(/Continue/); expect(screen.getByText(/at least R1/)).toBeTruthy();
  });
});

const fillLoan = () => { type(/How much do you need/, "R 45 000"); type(/Over how long/, "36"); type(/What is it for/, "education"); type(/Employment status/, "employed"); type(/Employer or business name/, "Khayelitsha Youth Hub"); type(/monthly income/, "18 000"); type(/monthly living costs/, "9 000"); type(/already repay/, "0"); };
describe("checking and sending", () => {
  it("shows the answers in words, will not send until every declaration is ticked, then sends exactly what was entered", async () => {
    submit.mockResolvedValue({ success: true, data: { referenceNumber: "VNK-PA-LOAN000001", accountNumber: "x", id: "i1", status: "submitted" } } as never);
    mount("personalLoan", { initialProduct: "DreamFund" }); aboutYou(); press(/Continue/); fillLoan(); press(/Continue/);
    const dl = screen.getByLabelText("Your answers"); expect(within(dl).getByText("R 45 000")).toBeTruthy(); expect(within(dl).getByText("36 months")).toBeTruthy(); expect(within(dl).getByText("Education or training")).toBeTruthy(); expect(within(dl).getByText("DreamFund")).toBeTruthy();
    const send = screen.getByRole("button", { name: /Send application/ }) as HTMLButtonElement; expect(send.disabled).toBe(true);
    const boxes = screen.getAllByRole("checkbox"); expect(boxes).toHaveLength(5); boxes.slice(0, 4).forEach((b) => fireEvent.click(b)); expect(send.disabled).toBe(true); fireEvent.click(boxes[4]); expect(send.disabled).toBe(false);
    fireEvent.click(send); await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const sent = submit.mock.calls[0][0]; expect(sent).toMatchObject({ type: "personalLoan", subType: "DreamFund", applicantName: "Thandi Nkosi", applicantEmail: "thandi@example.com", applicantPhone: "+27 82 000 0000" });
    expect(sent.formData).toMatchObject({ product: "DreamFund", amount: 45000, termMonths: "36", purpose: "education", employment: "employed", employer: "Khayelitsha Youth Hub", income: 18000, expenses: 9000, debt: 0, declarationsAccepted: ["truthful", "notOffer", "creditCheck", "contact", "personalInfo"] }); expect(typeof (sent.formData as { declaredAt: string }).declaredAt).toBe("string");
  });
  it("then says, truthfully, that the application was received, shows the reference, and offers the identity check with the reference and email", async () => {
    submit.mockResolvedValue({ success: true, data: { referenceNumber: "VNK-PA-INS0000001", accountNumber: "x", id: "i1", status: "submitted" } } as never);
    const onClose = vi.fn(); mount("insurance", { initialProduct: "Life Insurance", onClose }); aboutYou(); press(/Continue/); type(/How much cover/, "1 000 000"); type(/For how long/, "to65"); type(/replace cover/, "no"); press(/Continue/);
    screen.getAllByRole("checkbox").forEach((b) => fireEvent.click(b)); press(/Send application/);
    expect(await screen.findByRole("heading", { name: "Application received" })).toBeTruthy(); expect(screen.getByText("VNK-PA-INS0000001")).toBeTruthy(); expect(screen.getByText(/This is not cover yet/)).toBeTruthy(); expect(screen.getByText(/thandi@example.com/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/approved|issued|activated|congratulations|welcome bonus/i);
    const step = screen.getByTestId("identity-step"); expect(step.getAttribute("data-ref")).toBe("VNK-PA-INS0000001"); expect(step.getAttribute("data-email")).toBe("thandi@example.com");
    press(/Back to VINK/); expect(onClose).toHaveBeenCalled();
  });
  it("sends only once however often the button is pressed, and says why when it could not be sent, letting them try again", async () => {
    let resolve!: (v: unknown) => void; submit.mockImplementationOnce(() => new Promise((r) => { resolve = r; }) as never).mockResolvedValueOnce({ success: false, error: "The server is busy." } as never).mockRejectedValueOnce(new Error("offline"));
    mount("insurance", { initialProduct: "Funeral Cover" }); aboutYou(); press(/Continue/); type(/Cover for you/, "20 000"); type(/spouse or partner/, "yes"); type(/Children to cover/, "2"); type(/Parents or in-laws/, "0"); type(/Other family members/, "0"); press(/Continue/);
    screen.getAllByRole("checkbox").forEach((b) => fireEvent.click(b)); const send = () => screen.getByRole("button", { name: /Send application|Sending/ });
    fireEvent.click(send()); fireEvent.click(send()); fireEvent.click(send()); expect(submit).toHaveBeenCalledTimes(1); expect(screen.getByRole("button", { name: /Sending/ })).toBeTruthy();
    resolve({ success: false, error: "Could not save your application." }); expect((await screen.findByRole("alert")).textContent).toBe("Could not save your application."); expect(screen.queryByRole("heading", { name: "Application received" })).toBeNull();
    fireEvent.click(send()); await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("The server is busy.")); fireEvent.click(send()); await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/check your connection/)); expect(screen.getByRole("button", { name: /Send application/ })).toBeTruthy();
  });
});

describe("opening and closing", () => {
  it("renders nothing while closed, closes from the cross, and starts afresh each time it opens", () => {
    const { rerender } = render(<ProductApplicationViewer isOpen={false} onClose={vi.fn()} kind="insurance" />); expect(document.body.textContent).toBe("");
    const onClose = vi.fn(); rerender(<ProductApplicationViewer isOpen onClose={onClose} kind="insurance" />); fireEvent.click(screen.getByRole("radio", { name: /Life Insurance/ })); press(/Continue/); aboutYou();
    press(/Close/); expect(onClose).toHaveBeenCalled(); rerender(<ProductApplicationViewer isOpen={false} onClose={onClose} kind="insurance" />); rerender(<ProductApplicationViewer isOpen onClose={onClose} kind="insurance" />);
    expect(screen.getByRole("radio", { name: /Life Insurance/ })).toBeTruthy(); expect((screen.getByRole("radio", { name: /Life Insurance/ }) as HTMLInputElement).checked).toBe(false);          // back at the start, nothing remembered
  });
});
