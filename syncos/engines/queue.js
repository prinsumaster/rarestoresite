const db = require('../db/db');
const crypto = require('crypto');
const config = require('../config/index');

class JobQueue {
  constructor() {
    this.running = false;
  }

  async addJob(runId, productId, targetUrl, payload = {}) {
    const id = crypto.randomUUID();
    await db.run(
      `INSERT INTO sync_jobs (id, run_id, product_id, target_url, status, payload) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, runId, productId, targetUrl, 'QUEUED', JSON.stringify(payload)]
    );
    return id;
  }

  async updateJobStatus(id, status, errorMsg = null) {
    if (errorMsg) {
      await db.run(`UPDATE sync_jobs SET status = ?, error_msg = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, errorMsg, id]);
    } else {
      await db.run(`UPDATE sync_jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, id]);
    }
  }

  async process(runId, handlers) {
    this.running = true;
    
    const worker = async () => {
      while (this.running) {
        // Find and lock a pending job transactionally
        let job = null;
        await new Promise((resolve, reject) => {
          db.db.serialize(() => {
            db.db.get(`SELECT * FROM sync_jobs WHERE run_id = ? AND status = 'QUEUED' ORDER BY created_at ASC LIMIT 1`, [runId], (err, row) => {
              if (err) return reject(err);
              job = row;
              if (job) {
                db.db.run(`UPDATE sync_jobs SET status = 'SCRAPING' WHERE id = ?`, [job.id], (err2) => {
                  if (err2) return reject(err2);
                  resolve();
                });
              } else {
                resolve();
              }
            });
          });
        });
        
        if (!job) break; // no more jobs

        try {
          if (handlers['SyncSeller']) {
            await handlers['SyncSeller'](job);
          } else {
            throw new Error(`No handler for SyncSeller`);
          }
          await this.updateJobStatus(job.id, 'PUBLISHED'); // The final state if all goes well in handler
        } catch (err) {
          console.error(`Job ${job.id} failed:`, err.message);
          
          let retryable = true;
          if (err.message.includes('404')) retryable = false;

          if (retryable && job.retries < config.max_retries) {
            const nextRetries = job.retries + 1;
            await db.run(`UPDATE sync_jobs SET status = 'QUEUED', retries = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [nextRetries, job.id]);
            
            if (err.message.includes('429')) {
               await new Promise(r => setTimeout(r, Math.pow(2, nextRetries) * 1000));
            } else if (err.message.includes('Cloudflare')) {
               await new Promise(r => setTimeout(r, 10000));
            }
          } else {
            await this.updateJobStatus(job.id, 'FAILED', err.message);
          }
        }
      }
    };

    // Spawn workers up to config.concurrency
    const workers = [];
    for (let i = 0; i < config.concurrency; i++) {
      workers.push(worker());
    }
    
    await Promise.all(workers);
    this.running = false;
  }
}

module.exports = new JobQueue();
