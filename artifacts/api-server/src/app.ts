import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "node:path";
import router from "./routes";
import { logger } from "./lib/logger";
import { UPLOAD_ROOT } from "./lib/upload";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded chat attachments and KYC documents. Files are stored under
// random-hex filenames (see lib/upload.ts) so this directory listing carries
// no guessable path; still gated behind the API base path only, not auth —
// KYC docs are only ever linked from authenticated admin/owner responses.
app.use("/api/uploads", express.static(UPLOAD_ROOT));

app.use("/api", router);

// In production Render runs the API and the Vite bundle in one Web Service so
// browser requests to /api and /api/ws stay on the same origin.
const webRoot = path.resolve(
  process.cwd(),
  "artifacts/jakarta-gig-finder/dist/public",
);
app.use(express.static(webRoot));
app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api")) {
    res.sendFile(path.join(webRoot, "index.html"));
    return;
  }
  next();
});

export default app;
