# Jamvanta local prototype

Jamvanta is RailSetu's bilingual voice layer. It accepts English, Hindi, or Hinglish speech, keeps the transcript only for the current page session, and dispatches a limited set of typed RailSetu actions. It cannot arbitrarily control the page.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Add `SARVAM_API_KEY` from the Sarvam AI dashboard and `OPENAI_API_KEY` from the OpenAI Platform API keys page.
3. Set `JAMVANTA_APPROVAL_SECRET` to a long random value generated locally. This is an application secret, not something purchased from Jamvanta or a provider.
4. Run `npm run dev` and open `http://localhost:3000/planner`.

Without provider keys, Jamvanta automatically uses its deterministic local command adapter and browser speech recognition. No API credits are consumed.

## Safety boundary

Planning, navigation, payment handoff, and ticket download use explicit application events. Wallet payment creates and verifies a short-lived HMAC approval token before the payment action is dispatched. Raw microphone audio is not stored by RailSetu.

This remains a civic-tech prototype: it does not book a real railway ticket or collect a real payment.
