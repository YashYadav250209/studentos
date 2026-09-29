# React + Vite

## Supabase Setup

1. Create a Supabase project and copy its Project URL and anon/publishable key from **Project Settings > API**.
2. Add those values to `.env.local` (never use a service-role key in this frontend):

	```env
	VITE_SUPABASE_URL=https://your-project.supabase.co
	VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
	```

3. Run the SQL in `supabase-schema.sql` in the Supabase SQL Editor. The table's row-level security policies restrict each signed-in account to its own records.
4. Run `supabase-institute-schema.sql` after the base schema to create Institute memberships, classes, module settings, invitations, generic module records, and role-scoped RLS policies.
5. Enable Email under **Authentication > Providers**. If email confirmation is enabled, users must confirm their address before signing in.
6. Restart the Vite dev server. The login/signup form then uses Supabase Auth and app data syncs to Supabase per account. Without these environment values, the app remains in local demo mode.

Guest/demo data already in browser storage is not automatically copied to Supabase.

## Institute Setup

The Institute workspace uses separate Admin, Teacher, Student, and Parent memberships. Institute module settings determine which modules are enabled and which roles can view them. Disabling a module updates its setting only; its records remain stored.

Institute creation requires an active row in `institute_subscription_entitlements`. Only a trusted billing webhook or a service-role process should write this table. The current Plans & Billing page is demo-only and does not process payments or provision entitlements, so it cannot grant Institute Admin access by itself. Never expose a Supabase service-role key in the frontend.

Member invitations are recorded by email; email delivery is not integrated. A member accepts a pending invitation by signing in with that email. Student progress reads the existing `studentos_user_data` sessions and JEE topic-status keys through role-checked database functions instead of copying them into Institute records. The current attendance, timetable, exam, and material examples elsewhere in the app are seed data; publishing Institute records uses the shared `institute_records` table.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
