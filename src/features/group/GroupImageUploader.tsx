import { type ChangeEvent, useEffect, useState } from "react";
import { Button } from "../../ui/Button";
import { prepareGroupImage } from "./imageProcessing";

const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const maxBytes = 5 * 1024 * 1024;

export function GroupImageUploader({
  disabled,
  onUpload,
  prepareImage = prepareGroupImage,
}: {
  disabled?: boolean;
  onUpload: (file: File, onProgress: (percent: number) => void) => Promise<void>;
  prepareImage?: (file: File) => Promise<File>;
}) {
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(
    () => () => {
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    setError("");
    setProgress(null);
    setFile(null);
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview("");
    if (!next) return;
    if (!allowedTypes.has(next.type)) {
      setError("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    if (next.size < 1 || next.size > maxBytes) {
      setError("Choose an image smaller than 5 MB.");
      return;
    }
    const previewUrl =
      typeof URL.createObjectURL === "function"
        ? URL.createObjectURL(next)
        : `data:${next.type};base64,preview`;
    setPreview(previewUrl);
    setFile(next);
  }

  async function upload() {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      const prepared = await prepareImage(file);
      await onUpload(prepared, setProgress);
      setProgress(100);
    } catch {
      setError(
        "The image could not be prepared or uploaded. Choose a clear image and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="group-image-uploader">
      <label>
        Group image
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={disabled || busy}
          onChange={chooseFile}
        />
      </label>
      {preview ? (
        <img
          className="group-image-preview"
          src={preview}
          alt="New group image preview"
        />
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {progress !== null ? (
        <p role="status">
          {progress >= 100 ? "Upload complete" : `Uploading: ${progress}%`}
        </p>
      ) : null}
      <Button
        variant="secondary"
        disabled={disabled || !file}
        busy={busy}
        onClick={upload}
      >
        Upload group image
      </Button>
    </div>
  );
}
