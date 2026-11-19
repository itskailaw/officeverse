import "server-only";
import { errorResponse, HttpError } from "@/lib/ai/server/guard";
import { LazadaError } from "./api";

export function chatError(e: unknown) {
  if (e instanceof LazadaError) {
    const perm = /permission|access|unauthori|insufficient|api.*not/i.test(`${e.code} ${e.message}`);
    return errorResponse(
      new HttpError(
        502,
        perm
          ? `Lazada chat isn't allowed for this app yet (${e.code}). Turn on the Instant Messaging permission group, then Re-connect Lazada.`
          : `Lazada chat error: ${e.code} ${e.message}`,
      ),
    );
  }
  return errorResponse(e);
}

