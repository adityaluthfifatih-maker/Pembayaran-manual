import multer from "multer";
import path from "node:path";
import { randomBytes } from "node:crypto";
import fs from "node:fs";

/**
 * Resolved root directory for uploaded files.
 * Default: <api-server-cwd>/uploads
 * Override via UPLOAD_ROOT env var.
 */
export const UPLOAD_ROOT = path.resolve(
  process.env["UPLOAD_ROOT"] ?? path.join(process.cwd(), "uploads"),
);

// Ensure sub-directories exist at startup.
for (const sub of ["chat", "kyc"]) {
  fs.mkdirSync(path.join(UPLOAD_ROOT, sub), { recursive: true });
}

function makeStorage(subdir: string) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, path.join(UPLOAD_ROOT, subdir));
    },
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase() || ".bin";
      const name = randomBytes(16).toString("hex");
      cb(null, `${name}${ext}`);
    },
  });
}

const ALLOWED_CHAT_MIME = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
]);

const ALLOWED_KYC_MIME = new Set(["image/jpeg", "image/png"]);

/** 5 MB upload limit */
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

export const chatUpload = multer({
  storage: makeStorage("chat"),
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter(_req, file, cb) {
    if (ALLOWED_CHAT_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Hanya JPG, PNG, dan PDF yang diizinkan untuk lampiran chat."));
    }
  },
});

export const kycUpload = multer({
  storage: makeStorage("kyc"),
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter(_req, file, cb) {
    if (ALLOWED_KYC_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Hanya JPG dan PNG yang diizinkan untuk dokumen KYC."));
    }
  },
});
