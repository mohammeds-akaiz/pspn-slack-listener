const { App } = require('@slack/bolt');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true
});

// Your Slack User ID
const APPROVER_USER_ID = 'U0BN83LSQNB';

// Destination channel
const DESTINATION_CHANNEL = 'C08TLF8LN5U';

// Store pending approvals in memory.
// We'll improve this later if needed.
const pendingApprovals = new Map();


// Receive DMs
app.event('message', async ({ event, client, logger }) => {

  try {

    // Ignore bot messages
    if (event.bot_id) return;

    // Only process direct messages
    if (event.channel_type !== 'im') return;

    // Only process messages from you
    if (event.user !== APPROVER_USER_ID) return;

    const text = (event.text || '').trim().toLowerCase();

    // Only accept replies in a thread
    if (!event.thread_ts) {
      await client.chat.postMessage({
        channel: event.channel,
        text: 'Please reply to the Scrum approval message with *APPROVE* or *DECLINE*.'
      });
      return;
    }

    const pending = pendingApprovals.get(event.thread_ts);

    if (!pending) {
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.thread_ts,
        text: 'This Scrum approval is no longer active.'
      });
      return;
    }

    // APPROVE
    if (text === 'approve' || text === 'approved' || text === 'yes') {

      await client.chat.postMessage({
        channel: DESTINATION_CHANNEL,
        text: pending.scrum
      });

      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.thread_ts,
        text: '✅ Approved. The Scrum has been posted to #pspn-only.'
      });

      pendingApprovals.delete(event.thread_ts);
      return;
    }

    // DECLINE
    if (text === 'decline' || text === 'declined' || text === 'no') {

      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.thread_ts,
        text: '❌ Declined. The Scrum will not be posted.'
      });

      pendingApprovals.delete(event.thread_ts);
      return;
    }

    // Anything else
    await client.chat.postMessage({
      channel: event.channel,
      thread_ts: event.thread_ts,
      text: 'Please reply with *APPROVE* or *DECLINE*.'
    });

  } catch (error) {
    logger.error(error);
  }
});


// HTTP endpoint for Google Apps Script
// This lets your Apps Script send the Scrum to this listener.
const PORT = process.env.PORT || 3000;

const express = require('express');
const expressApp = express();

expressApp.use(express.json());

expressApp.post('/submit-scrum', async (req, res) => {

  try {

    // Check webhook security key
    const secret = req.headers['x-pspn-secret'];

    if (secret !== process.env.PSPN_WEBHOOK_SECRET) {
      return res.status(401).json({
        ok: false,
        error: 'Unauthorized'
      });
    }

    const { scrum } = req.body;

    if (!scrum) {
      return res.status(400).json({
        ok: false,
        error: 'Missing scrum'
      });
    }

    const result = await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: APPROVER_USER_ID,
      text:
        `*PSPN Scrum — Approval Required*\n\n` +
        `Please review today's Scrum below.\n\n` +
        `${scrum}\n\n` +
        `Reply in this thread with *APPROVE* or *DECLINE*.`
    });

    pendingApprovals.set(result.ts, {
      scrum: scrum,
      createdAt: Date.now()
    });

    res.json({
      ok: true,
      timestamp: result.ts
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      ok: false,
      error: error.message
    });

  }

});

    if (!scrum) {
      return res.status(400).json({
        ok: false,
        error: 'Missing scrum'
      });
    }

    const result = await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: APPROVER_USER_ID,
      text:
        `*PSPN Scrum — Approval Required*\n\n` +
        `Please review today's Scrum below.\n\n` +
        `${scrum}\n\n` +
        `Reply in this thread with *APPROVE* or *DECLINE*.`
    });

    pendingApprovals.set(result.ts, {
      scrum: scrum,
      createdAt: Date.now()
    });

    res.json({
      ok: true,
      timestamp: result.ts
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      ok: false,
      error: error.message
    });

  }

});

expressApp.get('/', (req, res) => {
  res.send('PSPN Slack Listener is running.');
});

expressApp.listen(PORT, () => {
  console.log(`HTTP server running on port ${PORT}`);
});

(async () => {
  await app.start();
  console.log('⚡ PSPN Slack Listener is running!');
})();
