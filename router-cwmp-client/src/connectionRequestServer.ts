import { createServer, type IncomingMessage, type ServerResponse } from "http";

/**
 * The CPE-side HTTP listener for ACS-initiated Connection Requests --
 * confirmed real via research: "GET /ConnectionRequest HTTP/1.1" with
 * Basic auth is how a real ACS tells a device "start a session with
 * me now" rather than waiting for the device's next periodic Inform.
 * This is the device-side counterpart to genieAcsClient.ts's own
 * enqueueTask()'s connection_request query parameter -- confirmed
 * consistent between the two independently-verified sources (the
 * GenieACS NBI docs and the TR-069 spec/examples) rather than assumed.
 */

export interface ConnectionRequestServerOptions {
  port: number;
  username?: string;
  password?: string;
  onConnectionRequest: () => void;
}

export function startConnectionRequestServer(options: ConnectionRequestServerOptions) {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (options.username) {
      const authHeader = req.headers.authorization;
      const expected = `Basic ${Buffer.from(`${options.username}:${options.password ?? ""}`).toString("base64")}`;
      if (authHeader !== expected) {
        res.writeHead(401, { "WWW-Authenticate": 'Basic realm="CWMP Connection Request"' });
        res.end();
        return;
      }
    }

    if (req.method === "GET") {
      res.writeHead(200);
      res.end();
      options.onConnectionRequest();
    } else {
      res.writeHead(405);
      res.end();
    }
  });

  server.listen(options.port);
  return server;
}
