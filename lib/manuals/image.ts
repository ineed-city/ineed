import "server-only";

// Poza vine din browser deja micșorată, ca data URL JPEG. O verificăm aici:
// doar imagini, și nu mai mari decât ar trebui după micșorare.
const MAX_BASE64_CHARS = 900_000;

export type JpegImage = { mediaType: "image/jpeg"; data: string };

export function parseImageDataUrl(value: FormDataEntryValue | null): JpegImage | null {
  if (typeof value !== "string" || !value) return null;
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match || match[1].length > MAX_BASE64_CHARS) return null;
  return { mediaType: "image/jpeg", data: match[1] };
}
