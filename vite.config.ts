import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { defineConfig, type Plugin } from 'vite';

/** Where a listening session's verdicts land. Gitignored — it is a working file. */
const REVIEW_FILE = path.join('scratch', 'voice-review.json');

/**
 * The sound debug view's one server-side need: mark this line for review.
 *
 * A browser cannot write a file and Matt will not hand-edit one, so the only way
 * a verdict formed while listening gets back to a prompt is a POST to the dev
 * server that appends it. `apply: 'serve'` — a built page has no server behind
 * it and the view says so on screen when the POST fails.
 *
 * Append-only and unconditional: the same id marked twice is two entries,
 * because the log is a record of a listening session and not a set.
 */
function voiceReview(): Plugin {
  return {
    name: 'seraphina-voice-review',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__voice-review', (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }

        let body = '';
        req.on('data', (chunk: Buffer) => (body += chunk));
        req.on('end', () => {
          try {
            const { id } = JSON.parse(body || '{}') as { id?: string };
            if (!id) throw new Error('no line id');

            const file: { version: number; marks: { id: string; at: string }[] } = (() => {
              try {
                return JSON.parse(readFileSync(REVIEW_FILE, 'utf8')) as never;
              } catch {
                return { version: 1, marks: [] };
              }
            })();
            file.marks.push({ id, at: new Date().toISOString() });

            mkdirSync(path.dirname(REVIEW_FILE), { recursive: true });
            writeFileSync(REVIEW_FILE, `${JSON.stringify(file, null, 2)}\n`);

            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ marks: file.marks.length }));
          } catch (error) {
            res.statusCode = 400;
            res.end(String(error instanceof Error ? error.message : error));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [voiceReview()],
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 5173,
    strictPort: true,
  },
  build: {
    // Phaser is one big chunk; no point warning about it every build.
    chunkSizeWarningLimit: 2000,
  },
});
