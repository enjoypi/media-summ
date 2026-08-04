FROM oven/bun:1.3.14 AS builder
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN bun build --compile --minify --bytecode --no-compile-autoload-bunfig --reject-unresolved --target=bun-linux-arm64 --outfile=dist/media-summ bin/media-summ.ts

FROM gcr.io/distroless/base-nossl-debian13:nonroot
WORKDIR /app
COPY --from=builder /app/dist/media-summ /app/media-summ
USER nonroot
ENTRYPOINT ["/app/media-summ"]
