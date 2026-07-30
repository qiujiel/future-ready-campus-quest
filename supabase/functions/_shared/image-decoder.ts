import {
  ImageMagick,
  initializeImageMagick,
} from "npm:@imagemagick/magick-wasm@0.0.41";
import type { DecodedImage } from "./media-core.ts";

let initialization: Promise<void> | undefined;

async function ensureInitialized(): Promise<void> {
  initialization ??= (async () => {
    const wasmBytes = await Deno.readFile(
      new URL(
        "magick.wasm",
        import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.41"),
      ),
    );
    await initializeImageMagick(wasmBytes);
  })();
  await initialization;
}

export async function decodeAndSanitizeImage(
  bytes: Uint8Array,
  declaredMimeType: string,
): Promise<DecodedImage> {
  await ensureInitialized();
  return ImageMagick.read(bytes, (image) => {
    const width = image.width;
    const height = image.height;
    image.strip();
    const sanitizedBytes = Uint8Array.from(image.write((data) => data));
    const extension =
      declaredMimeType === "image/jpeg"
        ? "jpg"
        : declaredMimeType === "image/png"
          ? "png"
          : "webp";
    return {
      mimeType: declaredMimeType as DecodedImage["mimeType"],
      extension,
      width,
      height,
      byteSize: sanitizedBytes.byteLength,
      sanitizedBytes,
    };
  });
}
