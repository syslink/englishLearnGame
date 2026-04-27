import { put, del } from "@vercel/blob";

// 允许的图片 MIME
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

// base64 解码后单张图片最大 200KB
const IMAGE_MAX_BYTES = 200 * 1024;

type ParsedDataUrl = {
  mime: string;
  ext: string;
  buffer: Buffer;
};

// 将 data:image/...;base64,xxx 解析为 mime + 二进制
export function parseDataUrl(dataUrl: string): ParsedDataUrl | null {
  const match = /^data:([a-z0-9+/.-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  if (!ALLOWED_MIME.has(mime)) return null;
  let buffer: Buffer;
  try {
    buffer = Buffer.from(match[2], "base64");
  } catch {
    return null;
  }
  if (buffer.length === 0 || buffer.length > IMAGE_MAX_BYTES) return null;
  const ext = mime === "image/jpeg" ? "jpg" : mime.split("/")[1].replace("+xml", "");
  return { mime, ext, buffer };
}

// 生成随机文件名，避免冲突与枚举
function randomFileName(ext: string): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex}.${ext}`;
}

function assertBlobTokenConfigured(): void {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN 未配置。请在 Vercel Dashboard → Storage → Blob 创建后，将 token 加到环境变量。",
    );
  }
}

// 上传图片（来自 data URL），返回公开 URL
export async function uploadImageFromDataUrl(
  dataUrl: string,
  pathPrefix: string,
): Promise<string> {
  assertBlobTokenConfigured();
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    throw new Error("图片格式非法或过大");
  }
  const safePrefix = pathPrefix.replace(/[^a-zA-Z0-9/_-]/g, "");
  const key = `${safePrefix}/${randomFileName(parsed.ext)}`;
  const blob = await put(key, parsed.buffer, {
    access: "public",
    contentType: parsed.mime,
    addRandomSuffix: false, // 我们已自己生成随机文件名
    cacheControlMaxAge: 60 * 60 * 24 * 365, // 一年缓存
  });
  return blob.url;
}

// 删除已上传的 blob（尽力而为，失败不抛）
export async function deleteBlobQuiet(url: string | null | undefined): Promise<void> {
  if (!url) return;
  try {
    assertBlobTokenConfigured();
    await del(url);
  } catch (err) {
    console.warn("delete blob failed:", err);
  }
}
