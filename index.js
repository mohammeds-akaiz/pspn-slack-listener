const { App } = require('@slack/bolt');
const express = require('express');

const APPROVER_USER_ID = 'U0BN83LSQNB';
const DESTINATION_CHANNEL = 'C08TLF8LN5U';

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true
});

const pendingApprovals = new Map();

const expressApp = express();
expressApp.use(express.json());


// ======================================================
// HEALTH CHECK
// ======================================================

expressApp.get('/', (req, res) => {
  res.send('PSPN Slack Listener is running.');
});


// ======================================================
// RECEIVE SCRUM FROM GOOGLE APPS SCRIPT
// ======================================================

expressApp.post('/submit-scrum', async (req, res) => {
  try {

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
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `*Reply in this thread with one of these:*\n\n` +
        `✅ *APPROVE* — Post to #pspn-only\n` +
        `❌ *DECLINE* — Do not post\n` +
        `🗑️ *DELETE* — Cancel and remove this approval`
    });


    // Store the Scrum against the Slack message/thread
    pendingApprovals.set(result.ts, {
      scrum: scrum,
      createdAt: Date.now()
    });


    console.log(
      `Scrum sent for approval. Message timestamp: ${result.ts}`
    );


    return res.json({
      ok: true,
      timestamp: result.ts
    });


  } catch (error) {

    console.error(
      'Error submitting Scrum:',
      error
    );

    return res.status(500).json({
      ok: false,
      error: error.message
    });

  }
});


// ======================================================
// HANDLE APPROVE / DECLINE / DELETE
// ======================================================

app.event('message', async ({ event, client, logger }) => {

  try {

    // Ignore bot messages
    if (event.bot_id) {
      return;
    }


    // Only listen to direct messages
    if (event.channel_type !== 'im') {
      return;
    }


    // Only accept commands from the designated approver
    if (event.user !== APPROVER_USER_ID) {
      return;
    }


    const text = (event.text || '')
      .trim()
      .toLowerCase();


    // --------------------------------------------------
    // Must be a thread reply
    // --------------------------------------------------

    if (!event.thread_ts) {

      await client.chat.postMessage({
        channel: event.channel,

        text:
          'Please reply in the Scrum approval thread with *APPROVE*, *DECLINE*, or *DELETE*.'
      });

      return;
    }


    // --------------------------------------------------
    // Find pending Scrum
    // --------------------------------------------------

    const pending = pendingApprovals.get(
      event.thread_ts
    );


    if (!pending) {

      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.thread_ts,

        text:
          '⚠️ This Scrum approval is no longer active.'
      });

      return;
    }


    // ==================================================
    // APPROVE
    // ==================================================

    if (
      text === 'approve' ||
      text === 'approved' ||
      text === 'yes'
    ) {

      console.log(
        `Approval received for thread ${event.thread_ts}`
      );


      await client.chat.postMessage({
        channel: DESTINATION_CHANNEL,
        text: pending.scrum
      });


      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.thread_ts,

        text:
          '✅ *Approved.* The Scrum has been posted to #pspn-only.'
      });


      // Remove immediately so it cannot be approved again
      pendingApprovals.delete(
        event.thread_ts
      );


      console.log(
        `Scrum approved and posted. Thread: ${event.thread_ts}`
      );


      return;
    }


    // ==================================================
    // DECLINE
    // ==================================================

    if (
      text === 'decline' ||
      text === 'declined' ||
      text === 'no'
    ) {

      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.thread_ts,

        text:
          '❌ *Declined.* The Scrum will not be posted.'
      });


      pendingApprovals.delete(
        event.thread_ts
      );


      console.log(
        `Scrum declined. Thread: ${event.thread_ts}`
      );


      return;
    }


    // ==================================================
    // DELETE
    // ==================================================

    if (
      text === 'delete' ||
      text === 'deleted' ||
      text === 'cancel' ||
      text === 'cancelled' ||
      text === 'canceled'
    ) {

      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.thread_ts,

        text:
          '🗑️ *Deleted.* This Scrum approval has been cancelled and will not be posted.'
      });


      pendingApprovals.delete(
        event.thread_ts
      );


      console.log(
        `Scrum deleted/cancelled. Thread: ${event.thread_ts}`
      );


      return;
    }


    // ==================================================
    // INVALID COMMAND
    // ==================================================

    await client.chat.postMessage({
      channel: event.channel,
      thread_ts: event.thread_ts,

      text:
        'Please reply with *APPROVE*, *DECLINE*, or *DELETE*.'
    });


  } catch (error) {

    logger.error(error);

  }

});


// ======================================================
// START HTTP SERVER
// ======================================================

const PORT = process.env.PORT || 3000;

expressApp.listen(PORT, () => {

  console.log(
    `HTTP server running on port ${PORT}`
  );

});


// ======================================================
// START SLACK SOCKET MODE
// ======================================================

(async () => {

  try {

    await app.start();

    console.log(
      '⚡ PSPN Slack Listener is running!'
    );

  } catch (error) {

    console.error(
      'Failed to start Slack listener:',
      error
    );

    process.exit(1);

  }

})();
