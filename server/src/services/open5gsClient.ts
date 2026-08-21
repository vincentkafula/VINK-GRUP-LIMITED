import { MongoClient, Collection, Db } from "mongodb";

/**
 * Real integration with a running Open5GS core network's subscriber
 * database -- NOT a REST API, because Open5GS genuinely doesn't have
 * one for this. Verified via web search before writing any of this:
 * there's an official GitHub issue ("Does open5gs support RESTful
 * API?") that was closed without one ever being added. The real,
 * documented way subscriber data gets into Open5GS is direct writes
 * to its MongoDB `subscribers` collection -- its own WebUI does
 * exactly this, nothing more privileged.
 *
 * Schema below is cross-verified against three independent real
 * sources, not guessed: the official open5gs-dbctl bash script
 * (misc/db/open5gs-dbctl in the open5gs/open5gs repo), the official
 * Python helper library (misc/db/python), and multiple live
 * `db.subscribers.find()` dumps shown in official open5gs/open5gs
 * GitHub issues and discussions. Field names, nesting, and defaults
 * below match all three.
 *
 * Honest limitation: this integration can only be verified by review
 * and by matching the documented schema exactly -- this sandbox has
 * no network path to download a real MongoDB binary to test against
 * (mongodb-memory-server's own CDN, fastdl.mongodb.org, isn't in the
 * allowed domains here), unlike the PostgreSQL work elsewhere in this
 * codebase, which was verified against a real, locally-installed
 * database. This has NOT been run against a live MongoDB instance.
 */

const DEFAULT_URI = "mongodb://localhost/open5gs";

let client: MongoClient | null = null;
let db: Db | null = null;

async function getDb(): Promise<Db> {
  if (db) return db;
  const uri = process.env.OPEN5GS_MONGO_URI || DEFAULT_URI;
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(); // uses the database name embedded in the URI (default "open5gs")
  return db;
}

async function getSubscribersCollection(): Promise<Collection> {
  const database = await getDb();
  return database.collection("subscribers");
}

/** Matches Open5GS's own AMBR unit convention: 0=bps 1=Kbps 2=Mbps 3=Gbps 4=Tbps */
export type AmbrUnit = 0 | 1 | 2 | 3 | 4;

export interface ProvisionSubscriberInput {
  imsi: string;          // 15-digit IMSI, must match the SIM's real programmed IMSI
  k: string;              // subscriber key (Ki), hex string, must match the SIM
  opc: string;             // operator variant key, hex string -- op and opc are mutually exclusive; this integration always uses opc (the more common choice), never op
  apn?: string;            // default "internet"
  downlinkMbps?: number;   // default 10
  uplinkMbps?: number;     // default 5
}

/**
 * Provisions a new subscriber into the real Open5GS core -- the exact
 * document shape open5gs-dbctl's own `add` command inserts, so a
 * subscriber created here is indistinguishable from one added through
 * Open5GS's own tooling.
 */
export async function provisionSubscriber(input: ProvisionSubscriberInput): Promise<{ imsi: string }> {
  const subscribers = await getSubscribersCollection();

  const existing = await subscribers.findOne({ imsi: input.imsi });
  if (existing) {
    throw new Error(`Subscriber with IMSI ${input.imsi} already exists in Open5GS`);
  }

  await subscribers.insertOne({
    schema_version: 1,
    imsi: input.imsi,
    msisdn: [],
    imeisv: [],
    mme_host: [],
    mme_realm: [],
    purge_flag: [],
    security: {
      k: input.k,
      op: null,
      opc: input.opc,
      amf: "8000", // Open5GS's own default AMF value, used by every real example seen in verification
    },
    ambr: {
      downlink: { value: input.downlinkMbps ?? 10, unit: 2 as AmbrUnit }, // unit 2 = Mbps
      uplink: { value: input.uplinkMbps ?? 5, unit: 2 as AmbrUnit },
    },
    slice: [
      {
        sst: 1,
        default_indicator: true,
        session: [
          {
            name: input.apn ?? "internet",
            type: 3, // IPv4v6, per the real dumps seen during verification
            qos: {
              index: 9, // QCI 9, the standard "default bearer" value used in every real example seen
              arp: { priority_level: 8, pre_emption_capability: 1, pre_emption_vulnerability: 1 },
            },
            ambr: {
              downlink: { value: input.downlinkMbps ?? 10, unit: 2 as AmbrUnit },
              uplink: { value: input.uplinkMbps ?? 5, unit: 2 as AmbrUnit },
            },
            pcc_rule: [],
          },
        ],
      },
    ],
    access_restriction_data: 32,
    subscriber_status: 0, // 0 = SERVICE_GRANTED
    network_access_mode: 0,
    subscribed_rau_tau_timer: 12,
    operator_determined_barring: 0,
    __v: 0,
  });

  return { imsi: input.imsi };
}

/**
 * Suspends a subscriber -- sets subscriber_status to 1
 * (OPERATOR_DETERMINED_BARRING per Open5GS's own convention), which
 * the real HSS honors on the next authentication attempt without
 * needing a daemon restart, per Open5GS's own documentation.
 */
export async function suspendSubscriber(imsi: string): Promise<boolean> {
  const subscribers = await getSubscribersCollection();
  const result = await subscribers.updateOne({ imsi }, { $set: { subscriber_status: 1 } });
  return result.matchedCount > 0;
}

export async function reactivateSubscriber(imsi: string): Promise<boolean> {
  const subscribers = await getSubscribersCollection();
  const result = await subscribers.updateOne({ imsi }, { $set: { subscriber_status: 0 } });
  return result.matchedCount > 0;
}

export async function deleteSubscriber(imsi: string): Promise<boolean> {
  const subscribers = await getSubscribersCollection();
  const result = await subscribers.deleteOne({ imsi });
  return result.deletedCount > 0;
}

export async function getSubscriber(imsi: string): Promise<Record<string, unknown> | null> {
  const subscribers = await getSubscribersCollection();
  return subscribers.findOne({ imsi });
}

export async function closeOpen5gsConnection(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
