# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Clients hiring Tem Revil (founders and businesses who want a web app, an AI feature or a site built).
- Recruiters and companies hiring for full-time or contract roles.
- Collaborators: other developers, designers, partners.
- People who want a casual talk, for example podcast hosts.

Most visitors to temrevil.com/book arrive from a link Tem sent them directly. They already know why they are there and want to pick a time fast.

## Product Purpose

Revil is Tem Revil's personal site (temrevil.com) plus a private admin dashboard (projects, treasury, bookings, messages, analytics, AI assistant, MCP server). The public site shows who he is and what he builds. The /book route is a short page for booking a call without the full portfolio. Success on /book: a visitor understands who they are booking and books a slot in under a minute.

## Positioning

A frontend and AI engineer who builds motion-rich web apps and puts AI to work inside them, and runs his own business tooling on the same stack.

## Capabilities and Constraints

- Next.js 16 static export on Hostinger; Firebase (Firestore, Functions, Storage, Auth) behind it. A push to main deploys the site.
- Booking: 60 min, free, Google Meet link generated automatically. Host working days and hours are converted to the guest's time zone. Busy slots come from Settings/BookedSlots. The guest can suggest a custom time. Fields: name, email, what it's about.
- Share links can tailor what a visitor sees (Analytics/Links, Tailor).

## Brand Commitments

- Name: Mohammed Ahmed, known as Tem Revil. Title on the live site: "Frontend & AI Engineer".
- Fonts in use: Archivo Black (name) and Inter (body and section titles). The handwriting is Shadows Into Light as pen strokes (src/lib/pen), written in stroke by stroke. Accent #3395ff.
- /book has a light, paint-and-collage look: dry-brush strokes, stacked cropped name type, photo panels.

## Evidence on Hand

- Hero photo (Firebase Storage, Settings/Hero.image.dark.png), dark studio background, not a cutout.
- Location El Mansoura, Egypt, UTC+03:00. Contact hello@temrevil.com; github.com/TemRevil, linkedin.com/in/tem-revil, instagram.com/temrevil.
- No testimonials, client logos or metrics exist for /book. Do not invent them.

## Product Principles

1. Get the visitor to a booked slot fast; everything else supports that.
2. Tell them who they are booking in one glance, not a portfolio.
3. Be honest about time: always show times in the visitor's own zone.
4. Personality through craft (paint, handwriting, motion), never through filler copy.
