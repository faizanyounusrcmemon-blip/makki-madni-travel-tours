MAKKI MADNI TRAVEL & TOURS — WEBSITE + ADMIN CMS
================================================

WHAT IS INCLUDED
- index.html: existing premium website design, with CMS-powered hotels/packages when configured.
- admin.html: private login/dashboard at /admin.html.
- admin.js: add/edit/delete, show/hide, image upload.
- cms-public.js: loads published hotels/packages on public website.
- cms-config.js: Supabase project URL + anon/public key placeholders.
- supabase-setup.sql: database tables, row-level security policies, and photo bucket setup.
- No service-role key or admin password is included in these files.

IMPORTANT
This ZIP is a complete deployable website bundle, but the CMS cannot store/manage content until you connect your own Supabase project and authorize an admin account. Supabase credentials are not supplied by this ZIP.

SETUP (free tier availability/limits are controlled by Supabase)
1) Create a SEPARATE Supabase project for this PUBLIC WEBSITE CMS if you have a free project slot.
   Do not use your travel-management software's production database. This CMS is separate.
2) In Supabase > SQL Editor, paste and run all of supabase-setup.sql.
3) In Supabase > Authentication > Users, create an admin user with your own email and a strong password. Disable public sign-ups in Authentication settings if available.
4) Copy that user's UUID from Authentication > Users.
5) In SQL Editor run (replace UUID):
   insert into public.website_admins (user_id) values ('YOUR-AUTH-USER-UUID');
6) In Supabase > Project Settings > API, copy Project URL and anon/public key (NOT service_role).
7) Open cms-config.js and replace:
   PAste_YOUR_SUPABASE_PROJECT_URL_HERE -> your Project URL
   PASTE_YOUR_SUPABASE_ANON_PUBLIC_KEY_HERE -> your anon/public key
   Keep quotation marks. Never paste service_role or database password.
8) Upload the whole ZIP's extracted contents to your GitHub repository root. Ensure index.html is in the root, not nested in an extra folder.
9) In Vercel import that GitHub repo. Framework preset: Other; Build command: leave blank; Output directory: . (or blank/default for static site). Deploy.
10) Open https://YOUR-VERCEL-DOMAIN/admin.html and log in. Add hotel/package, upload photo, choose visible, Save Changes.
11) Check homepage. If old cards still show, ensure both config values are correct and browser console/network has no Supabase policy errors.

SECURITY NOTES
- The anon/public key is intended for browser use; security depends on the SQL Row Level Security policies and website_admins allowlist.
- Never use a service_role key in cms-config.js or any browser file.
- Only add a trusted auth user's UUID to website_admins. Anyone whose UUID is in that table has admin permissions.
- This bundle does not change your separate Makki Madni Travel management software or its database.
- Free service tiers can change, pause, or impose usage limits; no provider offers a guaranteed free 24/7 SLA.
- Keep a local backup of this ZIP and your Supabase data.
