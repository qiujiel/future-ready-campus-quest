import {
  decodeStoredImage,
  inspectStoredImage,
  MediaBoundaryError,
  validateIncomingUpload,
} from "../functions/_shared/media-core";

function png(width: number, height: number, size = 24): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function jpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x07,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0xff,
    0xd9,
  ]);
}

function webp(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WEBP"), 8);
  bytes.set(new TextEncoder().encode("VP8X"), 12);
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;
  bytes.set(
    [
      encodedWidth & 0xff,
      (encodedWidth >> 8) & 0xff,
      (encodedWidth >> 16) & 0xff,
    ],
    24,
  );
  bytes.set(
    [
      encodedHeight & 0xff,
      (encodedHeight >> 8) & 0xff,
      (encodedHeight >> 16) & 0xff,
    ],
    27,
  );
  return bytes;
}

it.each([
  ["image/png", png(1200, 900), "png"],
  ["image/jpeg", jpeg(1200, 900), "jpg"],
  ["image/webp", webp(1200, 900), "webp"],
] as const)("accepts a valid %s stored image", (mime, bytes, extension) => {
  expect(inspectStoredImage(bytes, mime)).toEqual({
    mimeType: mime,
    extension,
    width: 1200,
    height: 900,
    byteSize: bytes.byteLength,
  });
});

it.each([
  ["image/svg+xml", new TextEncoder().encode("<svg></svg>")],
  ["image/gif", new TextEncoder().encode("GIF89a")],
] as const)("rejects unsupported %s uploads", (mime, bytes) => {
  expect(() => inspectStoredImage(bytes, mime)).toThrowError(
    expect.objectContaining({ code: "MEDIA_TYPE_REJECTED" }),
  );
});

it("rejects a declared MIME type that does not match the signature", () => {
  expect(() => inspectStoredImage(jpeg(800, 600), "image/png")).toThrowError(
    expect.objectContaining({ code: "MEDIA_SIGNATURE_MISMATCH" }),
  );
});

it("accepts raw input up to 5 MB but rejects larger files", () => {
  expect(
    validateIncomingUpload({ mimeType: "image/png", byteSize: 5 * 1024 * 1024 }),
  ).toBeUndefined();
  expect(() =>
    validateIncomingUpload({
      mimeType: "image/png",
      byteSize: 5 * 1024 * 1024 + 1,
    }),
  ).toThrowError(expect.objectContaining({ code: "MEDIA_TOO_LARGE" }));
});

it("rejects a stored object above the 2 MB defense-in-depth limit", () => {
  const oversized = png(1200, 1200, 2 * 1024 * 1024 + 1);

  expect(() => inspectStoredImage(oversized, "image/png")).toThrowError(
    expect.objectContaining({ code: "MEDIA_TOO_LARGE" }),
  );
});

it("rejects decoded dimensions above 2048 by 2048", () => {
  expect(() => inspectStoredImage(png(2049, 1200), "image/png")).toThrowError(
    expect.objectContaining({ code: "MEDIA_DIMENSIONS_REJECTED" }),
  );
});

it("uses neutral media errors without exposing object paths", () => {
  const error = new MediaBoundaryError("MEDIA_NOT_AVAILABLE", 404);

  expect(error.message).toBe("MEDIA_NOT_AVAILABLE");
  expect(error.message).not.toContain("/");
});

it("rejects a header-only image when the trusted decoder cannot read it", async () => {
  await expect(
    decodeStoredImage(png(1200, 900), "image/png", async () => {
      throw new Error("decoder rejected truncated PNG");
    }),
  ).rejects.toMatchObject({ code: "MEDIA_TYPE_REJECTED", status: 400 });
});

it("rejects oversized declared dimensions before invoking the decoder", async () => {
  let decoderCalled = false;

  await expect(
    decodeStoredImage(png(2049, 1200), "image/png", async () => {
      decoderCalled = true;
      throw new Error("should not decode");
    }),
  ).rejects.toMatchObject({ code: "MEDIA_DIMENSIONS_REJECTED", status: 400 });
  expect(decoderCalled).toBe(false);
});
