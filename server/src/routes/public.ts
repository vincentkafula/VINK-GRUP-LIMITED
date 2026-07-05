import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";

const router: ReturnType<typeof Router> = Router();

// In-memory stores for public submissions
const contacts:     { id: string; name: string; email: string; phone: string; subject: string; message: string; type: string; createdAt: string; status: string }[] = [];
const subscribers:  { id: string; email: string; createdAt: string }[] = [];
const applications: { id: string; product: string; tier: string; name: string; email: string; phone: string; idNumber: string; income: string; employmentStatus: string; message: string; createdAt: string; status: string }[] = [];
const registrations:{ id: string; firstName: string; lastName: string; email: string; phone: string; idNumber: string; dateOfBirth: string; accountType: string; createdAt: string; status: string }[] = [];

// ─── POST /api/public/contact ─────────────────────────────────────────────────
router.post("/contact", (req: Request, res: Response): void => {
  const { name, email, phone, subject, message, type } = req.body;
  if (!name || !email || !message) {
    res.status(400).json({ success: false, error: "name, email and message are required" });
    return;
  }
  const record = { id: uuid(), name, email, phone: phone ?? "", subject: subject ?? "General Enquiry", message, type: type ?? "Personal", createdAt: new Date().toISOString(), status: "open" };
  contacts.push(record);
  res.status(201).json({ success: true, data: { id: record.id, message: "Thank you for contacting us. We will respond within 2 business hours." } });
});

// ─── POST /api/public/newsletter ─────────────────────────────────────────────
router.post("/newsletter", (req: Request, res: Response): void => {
  const { email } = req.body;
  if (!email || !String(email).includes("@")) {
    res.status(400).json({ success: false, error: "A valid email address is required" });
    return;
  }
  const exists = subscribers.find(s => s.email === email);
  if (exists) {
    res.json({ success: true, data: { message: "You are already subscribed to VMS updates." } });
    return;
  }
  subscribers.push({ id: uuid(), email, createdAt: new Date().toISOString() });
  res.status(201).json({ success: true, data: { message: "You have been subscribed. Welcome to VMS!" } });
});

// ─── POST /api/public/apply ───────────────────────────────────────────────────
router.post("/apply", (req: Request, res: Response): void => {
  const { product, tier, name, email, phone, idNumber, income, employmentStatus, message } = req.body;
  if (!product || !name || !email || !phone) {
    res.status(400).json({ success: false, error: "product, name, email and phone are required" });
    return;
  }
  const refNo = `VMS-${new Date().getFullYear()}-${String(applications.length + 1001).padStart(5, "0")}`;
  const record = { id: uuid(), product, tier: tier ?? "Standard", name, email, phone, idNumber: idNumber ?? "", income: income ?? "", employmentStatus: employmentStatus ?? "", message: message ?? "", createdAt: new Date().toISOString(), status: "pending_review" };
  applications.push(record);
  res.status(201).json({ success: true, data: { id: record.id, referenceNumber: refNo, message: `Your application for ${product} has been received. Reference: ${refNo}. We will contact you within 1 business day.` } });
});

// ─── POST /api/public/register ────────────────────────────────────────────────
router.post("/register", (req: Request, res: Response): void => {
  const { firstName, lastName, email, phone, idNumber, dateOfBirth, accountType } = req.body;
  if (!firstName || !lastName || !email || !phone || !idNumber) {
    res.status(400).json({ success: false, error: "firstName, lastName, email, phone and idNumber are required" });
    return;
  }
  const exists = registrations.find(r => r.email === email || r.idNumber === idNumber);
  if (exists) {
    res.status(409).json({ success: false, error: "An account with this email or ID number already exists" });
    return;
  }
  const record = { id: uuid(), firstName, lastName, email, phone, idNumber, dateOfBirth: dateOfBirth ?? "", accountType: accountType ?? "personal", createdAt: new Date().toISOString(), status: "pending_fica" };
  registrations.push(record);
  const accNo = `VMS${String(Math.floor(Math.random() * 9000000000) + 1000000000)}`;
  res.status(201).json({ success: true, data: { id: record.id, accountNumber: accNo, message: `Welcome to VMS, ${firstName}! Your account has been created. Please complete FICA verification to activate it.` } });
});

// ─── POST /api/public/credit-check ────────────────────────────────────────────
router.post("/credit-check", (req: Request, res: Response): void => {
  const { idNumber, firstName, lastName, income } = req.body;
  if (!idNumber) {
    res.status(400).json({ success: false, error: "idNumber is required" });
    return;
  }
  // Deterministic mock score based on last 3 digits of ID
  const seed = parseInt(String(idNumber).slice(-3)) || 500;
  const score = Math.min(850, Math.max(300, 500 + (seed % 350)));
  const rating = score >= 750 ? "Excellent" : score >= 650 ? "Good" : score >= 550 ? "Fair" : "Poor";
  const eligible = [
    { product: "Clear Access Account",     approved: true,  reason: "Meets all criteria" },
    { product: "Everyday Checking Account",approved: true,  reason: "Meets all criteria" },
    { product: "Vink Commuter Card",       approved: true,  reason: "Meets all criteria" },
    { product: "Personal Loan R1,000–R50K",approved: score >= 550, reason: score >= 550 ? "Pre-qualified" : "Score too low" },
    { product: "Vehicle Loan",             approved: score >= 620, reason: score >= 620 ? "Pre-qualified" : "Minimum score 620 required" },
    { product: "Grain Credit Card",        approved: score >= 680, reason: score >= 680 ? "Pre-qualified" : "Minimum score 680 required" },
    { product: "Vink Gold Card",           approved: score >= 750, reason: score >= 750 ? "Pre-qualified" : "Minimum score 750 required" },
  ];
  res.json({ success: true, data: { score, rating, eligible, tips: ["Pay all accounts on time every month", "Keep credit utilisation below 30%", "Avoid multiple credit applications in a short period", "Check your credit report annually for errors"] } });
});

// ─── GET /api/public/branches ─────────────────────────────────────────────────
router.get("/branches", (_req: Request, res: Response): void => {
  res.json({ success: true, data: [
    { id: "1", name: "VMS Head Office", address: "8 Rose Street, Cape Town CBD, State House Building", province: "Western Cape", lat: -33.9249, lng: 18.4241, phone: "+27210070772", hours: "Mon–Fri 08:00–17:00", services: ["Account opening", "FICA verification", "Card collection", "Device enquiries", "Business consultations"] },
    { id: "2", name: "VMS Cape Town Agent (Pick n Pay Gardens)", address: "Adderley St, Cape Town", province: "Western Cape", lat: -33.9214, lng: 18.4175, phone: null, hours: "Store trading hours", services: ["Card recharge", "Cash withdrawals"] },
    { id: "3", name: "VMS Agent (Shoprite Bellville)", address: "Durban Rd, Bellville", province: "Western Cape", lat: -33.9000, lng: 18.6310, phone: null, hours: "Store trading hours", services: ["Card recharge", "Cash withdrawals"] },
    { id: "4", name: "VMS Agent (Spar Mitchell's Plain)", address: "Lentegeur, Mitchell's Plain", province: "Western Cape", lat: -34.0479, lng: 18.6228, phone: null, hours: "Store trading hours", services: ["Card recharge", "Airtime top-up"] },
    { id: "5", name: "VMS Agent (Checkers Khayelitsha)", address: "Mew Way, Khayelitsha", province: "Western Cape", lat: -34.0359, lng: 18.6822, phone: null, hours: "Store trading hours", services: ["Card recharge", "Cash withdrawals"] },
  ]});
});

// ─── GET /api/public/stats ────────────────────────────────────────────────────
router.get("/stats", (_req: Request, res: Response): void => {
  res.json({ success: true, data: { afcDevices: 250000, dailyCommuters: 15000000, appRating: 4.8, partnerMerchants: 2100, countriesCovered: 175, merchantLocations: 55000000, sadcNations: 14 } });
});

// ─── GET /api/public/contacts (admin view) ────────────────────────────────────
router.get("/contacts",     (_req, res) => res.json({ success: true, data: contacts,     meta: { total: contacts.length } }));
router.get("/applications", (_req, res) => res.json({ success: true, data: applications, meta: { total: applications.length } }));
router.get("/subscribers",  (_req, res) => res.json({ success: true, data: subscribers,  meta: { total: subscribers.length } }));

export default router;
