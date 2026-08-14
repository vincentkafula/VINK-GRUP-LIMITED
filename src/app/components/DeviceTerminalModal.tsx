import { X, Cpu, Smartphone, Wifi, ShieldCheck, Zap, CreditCard, ScanLine, UserCheck, Radio, Thermometer, Building2 } from "lucide-react";
import { T_T20_SPEC, type DeviceTerminal } from "../data/deviceTerminal";

/**
 * Shared device terminal detail view -- the same Telpo T-T20 hardware
 * every dashboard's own device/vehicle table links out to, so a driver,
 * an owner, an investor and an association admin all see identical
 * hardware specs for the same physical unit, just with the live
 * status/battery/signal fields specific to that one terminal.
 */
export function DeviceTerminalModal({ device, onClose }: { device: DeviceTerminal; onClose: () => void }) {
  const rows: { icon: any; label: string; value: string }[] = [
    { icon: Cpu, label: "Model", value: `${T_T20_SPEC.model} · ${T_T20_SPEC.category}` },
    { icon: Smartphone, label: "System", value: `${T_T20_SPEC.os} · ${T_T20_SPEC.chipset} · ${T_T20_SPEC.screen}` },
    { icon: CreditCard, label: "NFC & EMV", value: `${T_T20_SPEC.nfc} · ${T_T20_SPEC.emv}` },
    { icon: ScanLine, label: "QR & biometrics", value: `${T_T20_SPEC.qr} · ${T_T20_SPEC.faceRecognition}` },
    { icon: Wifi, label: "Connectivity", value: `${T_T20_SPEC.connectivity} · ${T_T20_SPEC.samSlots}` },
    { icon: Zap, label: "Processing speed", value: `Offline: ${T_T20_SPEC.offlineSpeed} · Online: ${T_T20_SPEC.onlineSpeed}` },
    { icon: ShieldCheck, label: "Certifications", value: T_T20_SPEC.certifications },
    { icon: Thermometer, label: "Operating range", value: T_T20_SPEC.operatingRange },
    { icon: Radio, label: "Real-time link", value: T_T20_SPEC.realtime },
    { icon: UserCheck, label: "Security", value: T_T20_SPEC.security },
    { icon: Building2, label: "Backend", value: `${T_T20_SPEC.backendApi} · ${T_T20_SPEC.dataNetwork}` },
  ];

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-5" style={{ background: "rgba(10,14,35,.6)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 flex items-start justify-between" style={{ background: "linear-gradient(135deg,#0B1330,#1c2a5e)" }}>
          <div>
            <p className="text-white font-black text-[17px]">{T_T20_SPEC.model}</p>
            <p className="text-white/50 text-[12px] mt-0.5">{T_T20_SPEC.category}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 text-white/70"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="rounded-xl p-3.5 bg-gray-50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Serial</p>
              <p className="text-[13.5px] font-bold text-gray-900 font-mono">{device.serial}</p>
            </div>
            <div className="rounded-xl p-3.5 bg-gray-50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Status</p>
              <p className="text-[13.5px] font-bold flex items-center gap-1.5" style={{ color: device.status === "online" ? "#059669" : "#9CA3AF" }}>
                <span className="w-2 h-2 rounded-full" style={{ background: device.status === "online" ? "#059669" : "#9CA3AF" }} />
                {device.status === "online" ? "Online" : "Offline"}
              </p>
            </div>
            <div className="rounded-xl p-3.5 bg-gray-50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Battery</p>
              <p className="text-[13.5px] font-bold text-gray-900">{device.battery}%</p>
            </div>
            <div className="rounded-xl p-3.5 bg-gray-50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Signal</p>
              <p className="text-[13.5px] font-bold text-gray-900">{device.signal}</p>
            </div>
            <div className="rounded-xl p-3.5 bg-gray-50 col-span-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Assigned to</p>
              <p className="text-[13.5px] font-bold text-gray-900">{device.driver} · {device.vehicle}</p>
            </div>
          </div>

          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">Hardware specification</p>
          <div className="space-y-3">
            {rows.map(r => (
              <div key={r.label} className="flex items-start gap-3">
                <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#EEEBFF", color: "#6D5DFC" }}><r.icon className="w-4 h-4" /></span>
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-gray-900">{r.label}</p>
                  <p className="text-[11.5px] text-gray-500 leading-relaxed">{r.value}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-gray-400 mt-5 leading-relaxed">Every VINK AFC terminal on the network runs identical hardware — this device's specs are shared across all VINK dashboards, so drivers, owners, investors and associations always see the same certified equipment.</p>
        </div>
      </div>
    </div>
  );
}
