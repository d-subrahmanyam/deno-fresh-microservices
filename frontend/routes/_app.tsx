/** @jsxImportSource preact */
import { type PageProps } from "$fresh/server.ts";

// Set PLAUSIBLE_URL + PLAUSIBLE_DOMAIN via docker-compose.plausible.yml (or manually).
// If PLAUSIBLE_URL is unset, the script tag is omitted and no tracking occurs.
const PLAUSIBLE_URL = Deno.env.get("PLAUSIBLE_URL") || "";
const PLAUSIBLE_DOMAIN = Deno.env.get("PLAUSIBLE_DOMAIN") || "localhost";
// script.local.js skips the localhost exclusion present in the standard script.js.
// Use it whenever the tracked domain is localhost (dev/staging), script.js for real domains.
const PLAUSIBLE_SCRIPT = (PLAUSIBLE_DOMAIN === "localhost" || PLAUSIBLE_DOMAIN === "127.0.0.1")
  ? "script.local.js"
  : "script.js";

export default function App({ Component }: PageProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>ShopHub</title>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="stylesheet" href="/styles.css" />
        {PLAUSIBLE_URL && (
          <script
            defer
            data-domain={PLAUSIBLE_DOMAIN}
            src={`${PLAUSIBLE_URL}/js/${PLAUSIBLE_SCRIPT}`}
          />
        )}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              /* Custom scrollbar */
              ::-webkit-scrollbar { width: 8px; }
              ::-webkit-scrollbar-track { background: #f1f5f9; }
              ::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 4px; }
              ::-webkit-scrollbar-thumb:hover { background: #64748b; }
            `,
          }}
        />
      </head>
      <body class="antialiased">
        <Component />
      </body>
    </html>
  );
}
