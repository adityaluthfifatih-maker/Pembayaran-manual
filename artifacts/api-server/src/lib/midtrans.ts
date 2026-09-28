import { createHash, timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";
import { logger } from "./logger";

type MidtransConfig = {
  isProduction: boolean;
  serverKey: string;
  clientKey: string;
};

type SnapClient = {
  createTransaction(parameter: Record<string, unknown>): Promise<unknown>;
};

type IrisClient = {
  createPayouts(parameter: Record<string, unknown>): Promise<unknown>;
};

type MidtransClientModule = {
  Snap: new (config: MidtransConfig) => SnapClient;
  Iris: new (config: MidtransConfig) => IrisClient;
};

const require = createRequire(import.meta.url);
const midtransClient = require("midtrans-client") as MidtransClientModule;

export type SnapTransactionResponse = {
  token?: string;
  redirect_url?: string;
  [key: string]: unknown;
};

export type IrisPayoutResponse = Record<string, unknown>;

export function isMidtransProduction(): boolean {
  return process.env["MIDTRANS_IS_PRODUCTION"] === "true";
}

function getConfig(): MidtransConfig {
  const serverKey = process.env["MIDTRANS_SERVER_KEY"];
  const clientKey = process.env["MIDTRANS_CLIENT_KEY"];

  if (!serverKey || !clientKey) {
    throw new Error(
      "MIDTRANS_SERVER_KEY dan MIDTRANS_CLIENT_KEY wajib dikonfigurasi.",
    );
  }

  return {
    // This is explicitly false in Sandbox. Keeping it env-driven allows the
    // deployment setting to be audited without hardcoding credentials.
    isProduction: isMidtransProduction(),
    serverKey,
    clientKey,
  };
}

/**
 * Construct both official Midtrans API clients from the current environment.
 * Clients are intentionally created per operation so a workflow restart or
 * secret rotation cannot leave a stale credential object in memory.
 */
export function getMidtransClients(): {
  snap: SnapClient;
  iris: IrisClient;
} {
  const config = getConfig();
  return {
    snap: new midtransClient.Snap(config),
    iris: new midtransClient.Iris(config),
  };
}

export async function createSnapTransaction(
  parameter: Record<string, unknown>,
): Promise<SnapTransactionResponse> {
  const { snap } = getMidtransClients();
  const response = await snap.createTransaction(parameter);
  return response as SnapTransactionResponse;
}

export async function createIrisPayout(
  parameter: Record<string, unknown>,
): Promise<IrisPayoutResponse> {
  const { iris } = getMidtransClients();
  const response = await iris.createPayouts(parameter);
  return response as IrisPayoutResponse;
}

export function verifyMidtransSignature(input: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  signatureKey: string;
}): boolean {
  const serverKey = process.env["MIDTRANS_SERVER_KEY"];
  if (!serverKey) {
    throw new Error("MIDTRANS_SERVER_KEY belum dikonfigurasi.");
  }

  const expected = createHash("sha512")
    .update(
      `${input.orderId}${input.statusCode}${input.grossAmount}${serverKey}`,
      "utf8",
    )
    .digest("hex");
  const provided = input.signatureKey.trim().toLowerCase();
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");

  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

export function parseMidtransDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function logMidtransMode(): void {
  logger.info(
    { isProduction: isMidtransProduction() },
    "Midtrans Snap dan Iris initialized",
  );
}