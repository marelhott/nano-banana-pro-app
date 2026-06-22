<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy Mulen Nano

This repository contains the main Mulen Nano SPA and a separate `workflow/` Next.js subproject.

## Run Locally

**Prerequisites:** Node.js

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

4. Configure provider access:
   - server-side provider keys can be configured in Vercel environment variables
   - local browser overrides in Settings are optional

5. Run the app:

   ```bash
   npm run dev
   ```

6. Run quality checks:
   ```bash
   npm run check
   ```

## Deploy to Vercel

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Set environment variables in the Vercel dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - provider server keys as needed (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY`, `REPLICATE_API_KEY`, `FAL_KEY`)
4. Deploy!

### Supabase requirements

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are required for runtime.
- In Supabase Dashboard you must enable anonymous auth:
  - `Authentication → Providers → Anonymous sign-ins → Enable`
- App auth now automatically retries and reconnects to Supabase on transient failures.
- Apply migrations in `supabase/migrations/` (especially `20260211_enable_rls_with_pin_identity_links.sql`, `20260211_harden_users_and_flux_policies.sql`, and `20260217_security_advisor_restore_rls.sql`) to enable RLS on app tables and remove permissive `USING (true)` policies.
- `supabase/migrations/disable_rls_for_custom_pin.sql` is intentionally deprecated (no-op) and must not be used to disable table RLS.

### Provider operations

- API key tests now run through backend endpoint `/api/provider-key-test` (no direct browser-to-provider probe).
- Runtime helper endpoints used by Mulen Nano:
  - `/api/public-config`
  - `/api/r2-presign`
  - `/api/fal/lora-img2img`
  - `/api/replicate/predictions`

### Notes

- `supabase/migrations/` is the only supported source of truth for database changes.
- `workflow/` has its own package.json, tests, and deployment/runtime assumptions.
