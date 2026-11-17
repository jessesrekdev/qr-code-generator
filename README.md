# Open QR Studio

A modern, responsive QR code generator built with React, TypeScript and Vite. Upgraded from the original 2024 static HTML project.

## Features
- Dashboard, QR Studio, saved library and About page
- Seven QR content types: URL, text, Wi-Fi, email, phone, SMS and vCard
- Live QR preview, foreground/background colors, gradient, dot and corner styles, optional uploaded logo
- High-resolution PNG and scalable SVG exports
- Browser-local saved designs and dark/light mode
- Responsive layouts for phones, tablets and desktop screens
- No paid QR API or backend required

## Start locally

```bash
npm install
npm run dev
```

Run `npm run build` to generate the static site in `dist/`. Deploy on Cloudflare Pages or any static hosting service using build command `npm run build` and output directory `dist`. Configure SPA fallback for deep links if required by your hosting provider.

## Security and privacy
The original public HTML contained an embedded Telegram bot token and silently sent generated QR images to a Telegram chat. This redesign **removes that behavior entirely**. Revoke/rotate the previously exposed Telegram bot token using BotFather: removing the token from the new branch does not remove it from historical Git commits or the original branch.

QR generation runs in the browser. Saved designs are kept in localStorage and are not synchronized between devices. Logos are stored as data URLs within the saved designs, so browser storage limits apply. Always test customized codes with a real scanner before printing.

## Tech
React 19, TypeScript, Vite, React Router, Lucide React and qr-code-styling.
