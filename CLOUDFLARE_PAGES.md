# Cloudflare Pages deployment

This React application builds into static files and uses Supabase directly from the browser. It does not need the current Railway web service.

## Cloudflare Pages settings

- Production branch: `dev`
- Build command: `npm run build`
- Build output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

Use the existing public Supabase URL and anon key. Do not add a service-role key, database password, or any server secret to Cloudflare Pages.

## Custom domain

No custom domain is currently attached to the Railway service. Choose an unused Cloudflare hostname after the Pages preview is verified.

After choosing it, add the hostname under **Workers & Pages → cringe-nice → Custom domains**. Also add the final HTTPS URL to Supabase Auth's allowed redirect URLs if the app's sign-in flow uses that domain.

## Cutover checklist

1. Create the Pages project from this GitHub repository and add the two public Supabase variables.
2. Test sign-in, invite links, realtime updates and the verdict-generation flow on the `pages.dev` preview.
3. Attach the intended Cloudflare domain, then add it to Supabase Auth redirect URLs if necessary.
4. Repeat the tests using the custom domain.
5. Only then retire the Railway web service.

Git-connected Pages builds a preview for pull requests and deploys `dev` to production.
