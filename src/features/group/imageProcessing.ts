const maxDimension = 2048;
const maxOutputBytes = 2 * 1024 * 1024;

function canvasBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("IMAGE_PROCESSING_NOT_AVAILABLE")),
      "image/webp",
      quality,
    );
  });
}

async function decodeImage(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    close: () => URL.revokeObjectURL(url),
  };
}

export async function prepareGroupImage(file: File): Promise<File> {
  const decoded = await decodeImage(file);
  try {
    const scale = Math.min(
      1,
      maxDimension / Math.max(decoded.width, decoded.height),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("IMAGE_PROCESSING_NOT_AVAILABLE");
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

    let output = await canvasBlob(canvas, 0.86);
    for (const quality of [0.72, 0.58, 0.44]) {
      if (output.size <= maxOutputBytes) break;
      output = await canvasBlob(canvas, quality);
    }
    if (output.size > maxOutputBytes) {
      throw new Error("IMAGE_TOO_COMPLEX");
    }

    return new File([output], "group-image.webp", {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } finally {
    decoded.close();
  }
}
