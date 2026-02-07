<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1OT7FMsEc7GhhcZllu6QWmRGmco9vsZ1r

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env.local` from the example template:
   ```bash
   cp .env.local.example .env.local
   ```

3. Configure environment variables in `.env.local`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY` (optional fallback for Gemini)

4. Configure provider API keys in app Settings (gear icon):
   - Gemini, OpenAI, Grok, Replicate
   - Keys are stored only in browser localStorage (not in Supabase)

5. Run the app:
   ```bash
   npm run dev
   ```

## Deploy to Netlify

1. Push your code to GitHub
2. Connect your repository to Netlify
3. Set environment variables in Netlify dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY` (optional fallback)
4. Deploy!

### Supabase requirements

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are required for runtime.
- App auth now automatically retries and reconnects to Supabase on transient failures.
- Apply migrations in `supabase/migrations/` (including `20260207_user_settings_rls_policies.sql`) to keep `user_settings` accessible only to `auth.uid() = user_id`.


## Deployment Status
Last update: 2025-12-31 06:33:37 UTC
