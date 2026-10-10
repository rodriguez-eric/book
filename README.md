# Quote Book

A phone-friendly quote archive for two friends. Every quote has its text, speaker, location, and the date and time it was said. Search, edit your own entries, draw a random quote, and export JSON.

## Try it on one phone

Upload the website files to GitHub Pages. With `config.js` blank, it works in **This device** mode. Those entries live in that browser only. Export JSON before clearing browser data or switching to the shared database.

## Make it shared

GitHub Pages hosts the app; Supabase stores the quotes. You need a Supabase project and its **Project URL** and **publishable key**. The publishable key belongs in `config.js`; never put a secret/service-role key in a GitHub repository.

1. Create a Supabase project. In **Authentication → Providers**, enable **Anonymous sign-ins**. No email service is needed.
2. Open its **SQL Editor**, paste all of `database.sql`, and run it once.
3. In `config.js`, fill in `url` and `publishableKey` from the project's API settings.
4. Create a GitHub repository such as `quote-book`. Upload the contents of this folder to its root. Under **Settings → Pages**, deploy from the `main` branch and `/ (root)`.
5. Open your published URL on your phone. Tap **Create our book**, then **Share invite link**. Your friend opens that link on their phone. Both can now add and read the same quotes.
6. On iPhone, open the site in Safari and use **Share → Add to Home Screen** for an app icon.

The invite link is the key to the book. Anyone with that link can join and see its quotes, so share it privately. Each phone has its own anonymous sign-in; if browser data is cleared or the app is reinstalled, use the invite link again. Keep a copy of it. The database rules let members read the shared book and edit or delete only quotes they added on that device. Both members can add entries. Export JSON periodically as a backup. Import appends entries, so importing the same file twice creates duplicates.

## Files

- `index.html`, `style.css`, `app.js`, `icon.svg`, `manifest.webmanifest`: the GitHub Pages app.
- `config.js`: the public project URL and publishable key for the shared database.
- `database.sql`: tables, functions, and row-level access rules to run in Supabase.

## Notes

- Date and time are entered in the phone's local time zone and stored as an absolute time. The app displays them in each viewer's local time zone.
- The shared book needs an internet connection. This app does not have a private server or an email login.
- There is no automatic merge from **This device** mode. Use **Export JSON** before filling `config.js`, then **Import JSON** after creating the shared book.
