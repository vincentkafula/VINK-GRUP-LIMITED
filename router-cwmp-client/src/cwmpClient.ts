import {
  buildInform, buildGetParameterValuesResponse, buildSetParameterValuesResponse,
  buildRebootResponse, buildDownloadResponse, parseCwmpMessage,
  type DeviceId, type EventEntry,
} from "./soap.js";
import { ParameterModel } from "./parameterModel.js";

/**
 * The real CWMP session flow, matching the verified sequence from the
 * official spec and multiple independent worked examples:
 * 1. CPE sends Inform as the FIRST message of the session (confirmed
 *    spec requirement: "All transaction sessions MUST begin with an
 *    Inform message from the CPE"). The initial POST may only contain
 *    one SOAP envelope.
 * 2. ACS responds with InformResponse.
 * 3. CPE sends an empty POST, signaling it has no more requests and is
 *    ready to receive ACS-initiated RPCs.
 * 4. ACS responds either with an RPC to process, or an empty response
 *    ending the session.
 * 5. If an RPC: CPE processes it and sends the matching response, then
 *    loops back to step 3/4 -- the ACS may have further RPCs.
 * 6. Session ends when the ACS's response is empty.
 */

export interface CwmpClientOptions {
  acsUrl: string;
  deviceId: DeviceId;
  acsUsername?: string;
  acsPassword?: string;
}

export class CwmpClient {
  private model: ParameterModel;

  constructor(private options: CwmpClientOptions) {
    this.model = new ParameterModel(options.deviceId.serialNumber);
  }

  private authHeader(): Record<string, string> {
    if (!this.options.acsUsername) return {};
    const encoded = Buffer.from(`${this.options.acsUsername}:${this.options.acsPassword ?? ""}`).toString("base64");
    return { Authorization: `Basic ${encoded}` };
  }

  private async post(body: string): Promise<string> {
    const res = await fetch(this.options.acsUrl, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", ...this.authHeader() },
      body,
    });
    if (!res.ok && res.status !== 204) {
      throw new Error(`ACS responded with HTTP ${res.status}`);
    }
    return res.status === 204 ? "" : await res.text();
  }

  async runSession(events: EventEntry[]): Promise<void> {
    const informParams = this.model.allEntries().slice(0, 3);
    const { xml: informXml } = buildInform(this.options.deviceId, events, informParams);

    let responseXml = await this.post(informXml);
    let parsed = parseCwmpMessage(responseXml);
    if (parsed.method !== "InformResponse") {
      throw new Error(`Expected InformResponse from ACS, got: ${parsed.method ?? "empty/unrecognized response"}`);
    }

    let nextRequest = "";
    // eslint-disable-next-line no-constant-condition
    while (true) {
      responseXml = await this.post(nextRequest);
      if (!responseXml || !responseXml.trim()) {
        return;
      }

      parsed = parseCwmpMessage(responseXml);
      nextRequest = this.handleAcsRpc(parsed);
    }
  }

  private handleAcsRpc(parsed: ReturnType<typeof parseCwmpMessage>): string {
    switch (parsed.method) {
      case "GetParameterValues": {
        const values = this.model.getMany(parsed.parameterNames ?? []);
        return buildGetParameterValuesResponse(parsed.messageId, values);
      }
      case "SetParameterValues": {
        this.model.setMany(parsed.parameterValues ?? []);
        return buildSetParameterValuesResponse(parsed.messageId, 0);
      }
      case "Reboot": {
        console.log(`[cwmp] Reboot requested (commandKey: ${parsed.commandKey ?? ""}) -- would trigger a real device reboot here`);
        return buildRebootResponse(parsed.messageId);
      }
      case "Download": {
        console.log(`[cwmp] Download requested: ${parsed.downloadFileType ?? "unknown type"} from ${parsed.downloadUrl ?? "unknown URL"} -- actually fetching and applying this file is a separate integration step for real hardware`);
        return buildDownloadResponse(parsed.messageId, 1);
      }
      default:
        console.error(`[cwmp] Unhandled ACS RPC: ${parsed.method}`);
        return "";
    }
  }
}
