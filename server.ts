/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function start_server() {
  const app = express();
  const PORT = 3006;

  // The OTT external proxy lives in the Node.ts backend at /api/ott.
  // The frontend calls it directly via VITE_API_BASE_URL — no proxy needed here.

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const dist_path = path.join(process.cwd(), "dist");
    // dotfiles: "allow" — without this, express.static defaults to "ignore"
    // and silently 404s anything under a dot-prefixed directory. That would
    // break /.well-known/assetlinks.json (TWA Digital Asset Links
    // verification) and any future ACME / well-known endpoints.
    app.use(express.static(dist_path, { dotfiles: "allow" }));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(dist_path, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Frontend running on http://localhost:${PORT}`);
  });
}

start_server();
