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

3. Set your Gemini API key in `.env.local`:
   - Get your API key from: https://aistudio.google.com/apikey
   - Open `.env.local` and replace `your_api_key_here` with your actual API key

4. Run the app:
   ```bash
   npm run dev
   ```

## Deploy to Netlify

1. Push your code to GitHub
2. Connect your repository to Netlify
3. Set environment variable in Netlify dashboard:
   - `GEMINI_API_KEY` = your Gemini API key
4. Deploy!


## Deployment Status
Last update: 2025-12-31 06:33:37 UTC
