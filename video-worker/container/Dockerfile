FROM node:22-bookworm-slim

# ffmpeg for rendering; Noto Sans CJK so Korean/Japanese/Chinese player
# names render (Geist, the site font, is Latin-only).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Geist, the same font the site uses (see src/app/layout.tsx), straight
# from its npm package.
RUN mkdir -p /usr/share/fonts/geist \
  && cd /tmp \
  && npm pack geist@1.7.2 \
  && tar xzf geist-1.7.2.tgz \
  && cp package/dist/fonts/geist-sans/Geist-Bold.ttf package/dist/fonts/geist-sans/Geist-SemiBold.ttf package/LICENSE.txt /usr/share/fonts/geist/ \
  && rm -rf /tmp/package /tmp/geist-1.7.2.tgz

WORKDIR /app
COPY render.mjs ./

# Batch job: renders one compilation from JOB_JSON, then exits.
CMD ["node", "/app/render.mjs"]
