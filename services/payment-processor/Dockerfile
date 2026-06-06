FROM denoland/deno:1.40.0 AS base

WORKDIR /app
RUN mkdir -p /deno-dir
ENV DENO_DIR=/deno-dir

COPY shared/ ./shared/
COPY services/payment-processor/ ./services/payment-processor/

RUN deno cache services/payment-processor/main.ts

FROM denoland/deno:1.40.0

WORKDIR /app

COPY --from=base /deno-dir /deno-dir
COPY --from=base /app ./

RUN rm -rf /deno-dir/gen/file/app/

ENV DENO_DIR=/deno-dir

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD sh -c 'printf "const r=await fetch(\"http://127.0.0.1:3002/health\");Deno.exit(r.ok?0:1);" | deno run --allow-net -'

CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "services/payment-processor/main.ts"]
