import nodemailer from 'nodemailer';
import { formatTime12h } from './db.js';

function getGmailCredentials() {
  const user = String(
    process.env.GMAIL_USER || process.env.EMAIL_USER || '',
  ).trim();
  const pass = String(
    process.env.GMAIL_APP_PASSWORD ||
      process.env.GMAIL_PASS ||
      process.env.EMAIL_PASS ||
      '',
  )
    .replace(/\s+/g, '')
    .trim();
  return { user, pass };
}

export function isMailerConfigured() {
  const { user, pass } = getGmailCredentials();
  return Boolean(user && pass);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildConfirmationHtml({
  bookingId,
  guestName,
  restaurantName,
  restaurantLocation,
  restaurantAddress,
  restaurantPhone,
  tableNumber,
  tableZone,
  bookingDate,
  startTime,
  endTime,
  partySize,
  notes,
}) {
  const formattedTime = `${formatTime12h(startTime)} – ${formatTime12h(endTime)} PKT`;
  const safeNotes = notes ? escapeHtml(notes) : 'None';

  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Table Reservation Confirmation</title>
  </head>
  <body style="margin:0;padding:24px;background-color:#F4F5F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F172A;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="background:#0F766E;padding:24px 28px;color:#FFFFFF;">
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">Mise · Hyderabad, Pakistan</div>
          <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;line-height:1.25;">Table Reservation Confirmed</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#334155;">
            Assalam-o-Alaikum <strong>${escapeHtml(guestName)}</strong>,
          </p>
          <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#475569;">
            Your table reservation at <strong>${escapeHtml(restaurantName)}</strong> has been received and saved. Below are your booking details:
          </p>

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #E2E8F0;border-radius:10px;background:#F8FAFC;margin-bottom:22px;">
            <tr>
              <td style="padding:12px 16px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#64748B;width:40%;">Booking ID</td>
              <td style="padding:12px 16px;border-bottom:1px solid #E2E8F0;font-size:13px;font-weight:700;font-family:monospace;color:#0F766E;">${escapeHtml(bookingId)}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#64748B;">Guest Name</td>
              <td style="padding:12px 16px;border-bottom:1px solid #E2E8F0;font-size:13px;font-weight:600;color:#0F172A;">${escapeHtml(guestName)}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#64748B;">Restaurant</td>
              <td style="padding:12px 16px;border-bottom:1px solid #E2E8F0;font-size:13px;font-weight:600;color:#0F172A;">${escapeHtml(restaurantName)}${restaurantLocation ? ` (${escapeHtml(restaurantLocation)})` : ''}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#64748B;">Date</td>
              <td style="padding:12px 16px;border-bottom:1px solid #E2E8F0;font-size:13px;font-weight:600;font-family:monospace;color:#0F172A;">${escapeHtml(bookingDate)}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#64748B;">Time</td>
              <td style="padding:12px 16px;border-bottom:1px solid #E2E8F0;font-size:13px;font-weight:600;font-family:monospace;color:#0F172A;">${escapeHtml(formattedTime)}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#64748B;">Guests &amp; Table</td>
              <td style="padding:12px 16px;border-bottom:1px solid #E2E8F0;font-size:13px;font-weight:600;color:#0F172A;">${escapeHtml(partySize)} Guests · Table ${escapeHtml(tableNumber)}${tableZone ? ` (${escapeHtml(tableZone)})` : ''}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-size:12px;color:#64748B;">Special Requests</td>
              <td style="padding:12px 16px;font-size:13px;color:#334155;">${safeNotes}</td>
            </tr>
          </table>

          ${
            restaurantAddress || restaurantPhone
              ? `<p style="margin:0 0 12px;font-size:12px;line-height:1.5;color:#64748B;">
                  <strong>Venue:</strong> ${escapeHtml(restaurantAddress || restaurantLocation || '')}${restaurantPhone ? ` · Phone: ${escapeHtml(restaurantPhone)}` : ''}
                </p>`
              : ''
          }
          <p style="margin:0;font-size:12px;line-height:1.5;color:#64748B;">
            Please keep your Booking ID (<strong>${escapeHtml(bookingId)}</strong>) handy upon arrival.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 28px;background:#F8FAFC;border-top:1px solid #E2E8F0;font-size:11px;color:#64748B;">
          Sent automatically by Mise Table Reservations · Hyderabad, Pakistan
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
}

async function sendViaGmailApi({ accessToken, to, subject, html }) {
  const mimeLines = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64'),
  ];

  const raw = Buffer.from(mimeLines.join('\r\n'), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    },
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Gmail API failed (${res.status})`);
  }

  return {
    sent: true,
    configured: true,
    method: 'gmail-api',
    recipient: to,
    messageId: data.id || null,
  };
}

export async function sendBookingConfirmationEmail(details) {
  const { user, pass } = getGmailCredentials();
  const recipient = String(details.guestEmail || '').trim();
  const gmailAccessToken = String(details.gmailAccessToken || '').trim();

  if (!recipient || !recipient.includes('@')) {
    return {
      sent: false,
      configured: Boolean(user && pass),
      recipient,
      reason: 'No valid email address found for this account.',
    };
  }

  const timeRange = `${formatTime12h(details.startTime)} - ${formatTime12h(details.endTime)} PKT`;
  const subject = `Booking Confirmed: ${details.restaurantName} (${details.bookingDate} · ${formatTime12h(details.startTime)} PKT) [${details.bookingId}]`;
  const html = buildConfirmationHtml(details);

  const text = [
    `Assalam-o-Alaikum ${details.guestName},`,
    '',
    `Your table booking at ${details.restaurantName} is confirmed.`,
    `Booking ID: ${details.bookingId}`,
    `Name: ${details.guestName}`,
    `Date: ${details.bookingDate}`,
    `Time: ${timeRange}`,
    `Guests: ${details.partySize}`,
    `Table: ${details.tableNumber}${details.tableZone ? ` (${details.tableZone})` : ''}`,
    `Special Requests: ${details.notes || 'None'}`,
    details.restaurantAddress ? `Address: ${details.restaurantAddress}` : '',
    '',
    'Thank you for booking with Mise.',
  ]
    .filter(Boolean)
    .join('\n');

  // 1. Prefer server-wide Nodemailer Gmail SMTP if configured
  if (user && pass) {
    try {
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        auth: {
          user,
          pass,
        },
      });

      const info = await transporter.sendMail({
        from: `"Mise Reservations" <${user}>`,
        to: recipient,
        subject,
        text,
        html,
      });

      return {
        sent: true,
        configured: true,
        method: 'nodemailer',
        recipient,
        messageId: info.messageId,
      };
    } catch (err) {
      console.error('Nodemailer confirmation error:', err);
      if (!gmailAccessToken) {
        return {
          sent: false,
          configured: true,
          recipient,
          reason: err?.message || 'Failed to send confirmation email via Gmail SMTP.',
        };
      }
    }
  }

  // 2. Fallback/Direct Gmail API send using logged-in user's OAuth permission
  if (gmailAccessToken) {
    try {
      return await sendViaGmailApi({
        accessToken: gmailAccessToken,
        to: recipient,
        subject,
        html,
      });
    } catch (err) {
      console.error('Gmail API send error:', err);
      return {
        sent: false,
        configured: Boolean(user && pass),
        needsGmailAuth: true,
        recipient,
        reason: err?.message || 'Gmail authorization expired. Reconnect Google to send confirmation.',
      };
    }
  }

  return {
    sent: false,
    configured: false,
    needsGmailAuth: true,
    recipient,
    reason:
      'Sign in with Google to authorize Gmail sending, or configure GMAIL_USER & GMAIL_APP_PASSWORD.',
  };
}
