/**
 * Browser-side image compression for photos (proof, evidence, customer photos).
 * Returns a JPEG data URL small enough to store with the record (< ~650 KB).
 */
export async function compressImage(file: File | Blob, maxDim = 1280): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.78, 0.65, 0.5, 0.38]) {
      const out = canvas.toDataURL("image/jpeg", q);
      if (out.length < 650_000) return out;
    }
    return canvas.toDataURL("image/jpeg", 0.3);
  } finally {
    URL.revokeObjectURL(url);
  }
}
