// recording.ts — téléchargement d'un enregistrement Retell et dépôt dans
// Supabase Storage. fetch est injecté pour rester testable hors réseau.

import type { RecordingRef, StoragePort } from "./crm-store.ts";

export const RECORDINGS_BUCKET = "call-recordings";

export type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

function extensionFor(contentType: string, url: string): string {
  if (contentType.includes("wav")) return "wav";
  if (contentType.includes("mpeg") || contentType.includes("mp3")) return "mp3";
  if (contentType.includes("ogg")) return "ogg";
  const m = url.split("?")[0].match(/\.([a-z0-9]{2,4})$/i);
  return m ? m[1].toLowerCase() : "wav";
}

/**
 * Télécharge l'enregistrement depuis Retell et le stocke dans le bucket.
 * Retourne la référence (bucket/path/bytes) à rattacher à l'appel, ou null
 * s'il n'y a pas d'URL d'enregistrement.
 */
export async function storeRecording(opts: {
  recordingUrl: string | null | undefined;
  beneficiaryId: string | null;
  retellCallId: string;
  storage: StoragePort;
  fetchFn: FetchLike;
}): Promise<RecordingRef | null> {
  const { recordingUrl, beneficiaryId, retellCallId, storage, fetchFn } = opts;
  if (!recordingUrl) return null;

  const res = await fetchFn(recordingUrl);
  if (!res.ok) {
    throw new Error(
      `Téléchargement enregistrement échoué (HTTP ${res.status}) pour ${retellCallId}`,
    );
  }

  const contentType = res.headers.get("content-type") ?? "audio/wav";
  const buf = new Uint8Array(await res.arrayBuffer());
  const ext = extensionFor(contentType, recordingUrl);
  const folder = beneficiaryId ?? "unassigned";
  const path = `beneficiaries/${folder}/calls/${retellCallId}.${ext}`;

  return storage.upload(RECORDINGS_BUCKET, path, buf, contentType);
}
