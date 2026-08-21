/**
 * TR-098/TR-181 data model parameter store. HONEST LIMIT, stated
 * plainly: this is an in-memory store standing in for what a real
 * device would populate from actual hardware -- real WiFi SSID/
 * password would come from hostapd's own config or control interface,
 * real WAN status would come from the actual modem/PPP/DHCP state,
 * etc. This client implements the CWMP protocol correctly (see
 * soap.ts's own verification), but wiring GetParameterValues/
 * SetParameterValues to genuinely read and change hardware state is a
 * separate integration step for whatever specific hardware this runs
 * on, same honest limit the retail-pos-app/till-app card readers
 * state for their own hardware.
 *
 * Uses the TR-098 InternetGatewayDevice.* naming convention
 * (confirmed as the real, common convention from GenieACS client
 * examples verified earlier) rather than the newer TR-181 Device.*
 * model -- either is real and valid; TR-098 was chosen since it's what
 * genieAcsClient.ts's own setWifiCredentials() already targets by
 * default.
 */

export class ParameterModel {
  private values = new Map<string, string>();

  constructor(deviceSerial: string) {
    this.values.set("InternetGatewayDevice.DeviceInfo.Manufacturer", "VINK");
    this.values.set("InternetGatewayDevice.DeviceInfo.ProductClass", "VINK-CPE-1");
    this.values.set("InternetGatewayDevice.DeviceInfo.SerialNumber", deviceSerial);
    this.values.set("InternetGatewayDevice.DeviceInfo.SoftwareVersion", "1.0.0");
    this.values.set("InternetGatewayDevice.DeviceInfo.HardwareVersion", "1.0");
    this.values.set("InternetGatewayDevice.DeviceInfo.UpTime", "0");
    this.values.set("InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID", "VINK-Router");
    this.values.set("InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey", "");
    this.values.set("InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Enable", "true");
    this.values.set("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress", "0.0.0.0");
    this.values.set("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ConnectionStatus", "Unconfigured");
  }

  get(name: string): string | undefined {
    return this.values.get(name);
  }

  getMany(names: string[]): { name: string; value: string }[] {
    return names
      .filter(n => this.values.has(n))
      .map(n => ({ name: n, value: this.values.get(n)! }));
  }

  setMany(parameters: { name: string; value: string }[]): void {
    for (const p of parameters) {
      this.values.set(p.name, p.value);
    }
  }

  allEntries(): { name: string; value: string }[] {
    return Array.from(this.values.entries()).map(([name, value]) => ({ name, value }));
  }
}
