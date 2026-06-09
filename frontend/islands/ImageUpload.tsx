/** @jsxImportSource preact */
import { useState } from "preact/hooks";

interface Props {
  name: string;
  currentUrl?: string;
  colSpan?: boolean;
}

type UploadStatus = "idle" | "uploading" | "done" | "error";

export default function ImageUpload({ name, currentUrl, colSpan }: Props) {
  const [url, setUrl] = useState(currentUrl ?? "");
  const [preview, setPreview] = useState(currentUrl ?? "");
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState("");

  async function handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    setStatus("uploading");
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      // Do NOT set Content-Type — the browser must set it with the multipart boundary
      const resp = await fetch("/api/upload", { method: "POST", body: formData });
      const payload = await resp.json() as { success: boolean; data?: { url: string }; error?: string };

      if (!resp.ok || !payload.success || !payload.data) {
        setStatus("error");
        setError(payload.error ?? "Upload failed.");
        return;
      }

      setUrl(payload.data.url);
      setPreview(payload.data.url);
      setStatus("done");
    } catch {
      setStatus("error");
      setError("Network error — please try again.");
    }
  }

  return (
    <div class={colSpan ? "block md:col-span-2" : "block"}>
      <span class="mb-2 block text-sm font-medium text-gray-700">Product Image</span>

      {/* Hidden input carries the stored URL as part of the normal form POST */}
      <input type="hidden" name={name} value={url} />

      <div class="flex items-start gap-4">
        {/* Thumbnail preview */}
        {preview && (
          <div class="flex-shrink-0">
            <img
              src={preview}
              alt="Product image preview"
              class="h-24 w-24 rounded-lg border border-gray-200 object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        )}

        <div class="flex-1 min-w-0">
          <label class="flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 py-6 hover:bg-gray-100">
            <svg
              class="mb-2 h-8 w-8 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            <span class="text-sm font-medium text-gray-600">
              {status === "uploading" ? "Uploading…" : "Click to upload image"}
            </span>
            <span class="mt-1 text-xs text-gray-400">JPEG, PNG, WebP, GIF or SVG · max 5 MB</span>
            <input
              type="file"
              accept="image/*"
              class="sr-only"
              disabled={status === "uploading"}
              onChange={handleFileChange}
            />
          </label>

          {status === "uploading" && (
            <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
              <div class="h-1.5 animate-pulse rounded-full bg-blue-500" style="width: 60%" />
            </div>
          )}
          {status === "done" && (
            <p class="mt-2 text-sm text-green-600">Image uploaded successfully.</p>
          )}
          {status === "error" && (
            <p class="mt-2 text-sm text-red-600">{error}</p>
          )}
          {url && (
            <p class="mt-1 truncate text-xs text-gray-400" title={url}>{url}</p>
          )}
        </div>
      </div>
    </div>
  );
}
