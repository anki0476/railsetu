# RailSetu native WhatsApp gateway

RailSetu connects directly to Meta's WhatsApp Cloud API. OpenClaw is not required. GPT-5.6 Luna reasons over each incoming message and can invoke only the typed RailSetu booking operations compiled into the application.

## Meta setup

1. Create a Meta developer app, add the WhatsApp product and attach a dedicated business phone number.
2. Set the webhook callback to `https://<railsetu-domain>/api/whatsapp/webhook` and subscribe to `messages`.
3. Set a private verification token and copy the app secret, permanent access token, phone-number ID and current Graph API version into the server-only environment variables documented in `.env.example`.
4. Add the RailSetu display name, logo, description and website in WhatsApp Manager. Meta must approve the display name before public use.
5. Apply `drizzle/0001_whatsapp_channel.sql` and `drizzle/0002_native_whatsapp.sql` to the deployment D1 database before enabling the webhook.

Never expose `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `CHANNEL_IDENTITY_SECRET` or `OPENAI_API_KEY` to browser code. Use independent random values for the verification, identity and dispatcher secrets.

## Runtime behavior

- `GET /api/whatsapp/webhook` performs Meta's webhook challenge.
- `POST /api/whatsapp/webhook` validates `X-Hub-Signature-256`, acknowledges immediately and processes accepted text/button messages in the background.
- Inbound message IDs are deduplicated and messages from the same passenger are serialized. Different passengers run concurrently.
- The raw phone number is encrypted for outbound delivery and is never included in the Luna prompt or ordinary logs.
- Search can run as a guest. Holding seats, viewing account data, checkout and cancellation require the short-lived account-link flow.
- Luna produces one goal-level tool decision per message. RailSetu then executes all currently safe steps directly against the booking core, minimizing model calls and latency.
- Every payment and cancellation ends at a short-lived RailSetu approval page. The agent cannot approve, capture or reuse authorization.
- Ticket and cancellation events are delivered immediately when possible. `POST /api/whatsapp/dispatch` can be invoked by a scheduled job with `Authorization: Bearer <WHATSAPP_DISPATCH_SECRET>` to retry durable pending events.

## Verification

Run `npm run test:whatsapp`, `npm run test:jamvanta` and `npm run build`. Use Meta's test number first. Verify a one-shot search, incremental completion, account linking, a five-minute hold, mandatory payment approval, ticket delivery, duplicate webhook delivery and cancellation confirmation before attaching the public RailSetu number.

