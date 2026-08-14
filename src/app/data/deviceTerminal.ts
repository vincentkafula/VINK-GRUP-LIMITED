/** Shared Telpo T-T20 specs, used consistently everywhere a device
 *  terminal is shown across the Driver, Owner, Investor and Taxi
 *  Association dashboards, so the same device is described identically
 *  no matter which dashboard someone is looking at it from. */
export const T_T20_SPEC = {
  model: "Telpo T-T20",
  category: "7-inch Android 12 Transit Validator",
  os: "Android 12",
  chipset: "Quad-Core 2.0 GHz",
  screen: '7" 720×1280',
  nfc: "ISO 14443 Type A/B · Mifare",
  emv: "EMV Contactless L1 (Visa Paywave · Mastercard Paypass)",
  qr: "1D/2D QR hard decoding",
  faceRecognition: "Dual-lens RGB+IR face recognition",
  connectivity: "4G LTE · WiFi · Bluetooth · GPS built-in",
  samSlots: "4× SAM slots",
  offlineSpeed: "280–520ms (fares under R500)",
  onlineSpeed: "600–900ms (online fast path)",
  processingTime: "Under 3 seconds offline",
  certifications: "IP65 · IK08 · CE · RoHS",
  operatingRange: "-20°C to 60°C · DC 9–40V",
  developer: "VINK Group (Pty) Ltd.",
  backendApi: "VINK Central API v2 · Cape Town",
  realtime: "WebSocket · sub-100ms latency",
  security: "256-bit AES · JWT Auth · FICA Compliant",
  dataNetwork: "VINK MVNO · Cell C 4G/LTE",
};

export interface DeviceTerminal {
  serial: string;
  status: "online" | "offline";
  battery: number;
  signal: "Strong" | "Moderate" | "Weak";
  lastSync: string;
  vehicle: string;
  driver: string;
}
