// wasans-video: everything that needs ffmpeg, in one Worker with two
// Container classes sharing one image (container/):
//
//   SubmissionVideoProcessor  (src/processing.js) every submission video,
//                             fed by the `video-processing` queue
//   CompilationRenderer       (src/compilation.js) the monthly WR
//                             compilation, started by the main app
//
// It has no public URL. The main app reaches it through its VIDEO_SERVICE
// service binding and the queue.
//
// Deploy from this directory with `npm install && npx wrangler deploy`
// (Docker must be running locally to build the image). See README.md in
// this directory for the one-time setup list.

import { ContainerProxy } from "@cloudflare/containers"
import { CompilationRenderer, handleCompilationRequest } from "./compilation.js"
import { SubmissionVideoProcessor, startProcessing } from "./processing.js"

export { CompilationRenderer, ContainerProxy, SubmissionVideoProcessor }

// A container that can't start right now (another run of the same
// submission is finishing, or every instance is busy) is simply tried again.
const START_RETRY_DELAY_SECONDS = 60

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === "POST" && url.pathname === "/compilations") {
      return handleCompilationRequest(request, env)
    }
    return new Response("Not found", { status: 404 })
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        await startProcessing(env, message.body)
        message.ack()
      } catch (error) {
        console.warn("Could not start video processing, retrying later:", error instanceof Error ? error.message : error)
        message.retry({ delaySeconds: START_RETRY_DELAY_SECONDS })
      }
    }
  },
}
