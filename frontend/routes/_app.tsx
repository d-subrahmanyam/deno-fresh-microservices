/** @jsxImportSource preact */
import { type PageProps } from "$fresh/server.ts";

export default function App({ Component }: PageProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>ShopHub</title>
        <script src="https://cdn.tailwindcss.com" />
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
