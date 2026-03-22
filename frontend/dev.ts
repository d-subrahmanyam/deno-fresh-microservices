#!/usr/bin/env -S deno run -A --watch=static/,routes/
/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.window" />

import dev from "$fresh/dev.ts";

await dev(import.meta.url, "./main.ts");
