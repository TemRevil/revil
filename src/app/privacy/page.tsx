import type { Metadata } from 'next';
import { SITE_URL } from '../../lib/projectPages';
import { EMAIL } from '../../lib/siteProfile';
import StandaloneBar from '../../standalone/StandaloneBar';
import '../../standalone/standalone.css';
import '../../standalone/privacy.css';

const title = 'Privacy & terms | Tem Revil';
const description = 'What temrevil.com records about a visit, what the contact and booking forms keep, which services it uses, and the terms of using the site.';

export const metadata: Metadata = {
    title,
    description,
    alternates: { canonical: '/privacy' },
    openGraph: { type: 'website', url: `${SITE_URL}/privacy`, title, description, siteName: 'Tem Revil', locale: 'en_US' },
};

// Written from what the code does: src/lib/analytics/collector.ts (the visit recorder),
// the contact and booking forms, and the services the site calls. Change it with them.
export default function Privacy() {
    return (
        <div className="pj">
            <div className="pj-wrap">
                <StandaloneBar />
                <main className="pv">
                    <h1>Privacy &amp; terms</h1>
                    <p className="pv-lead">The short version: this site keeps a simple record of visits to see what people read, and keeps what you send through its forms so it can reply. Nothing is sold or shared for advertising, and there are no ad or tracking networks on it.</p>

                    <h2>What a visit records</h2>
                    <ul>
                        <li>A random visitor id and a visit count, kept in your browser&apos;s local storage, so a return visit is recognised. A session id lives only until the tab closes.</li>
                        <li>Your device type, operating system, browser, screen and window size, language, light or dark theme, time zone and local time, and whether the screen is touch.</li>
                        <li>How you arrived: the referring site and any campaign tags in the link (utm, ref, gclid, fbclid).</li>
                        <li>Your country, worked out on the server from your IP address. The address itself is not stored.</li>
                        <li>What happened on the page: time spent in each section, how far you scrolled, when the tab went idle, which projects you opened and which links you followed, copying the email address, phone number or other text, opening the CV or the contact form, repeated or dead clicks, printing, and how fast the page loaded.</li>
                        <li>If you opened a personal share link, the visit is linked to it and its owner is emailed that it was opened.</li>
                    </ul>

                    <h2>What the forms keep</h2>
                    <ul>
                        <li><strong>Contact form:</strong> your name, email, optional phone number and WhatsApp choice, your message and any files you attach. It is stored in the site&apos;s database and emailed to me. Uploaded files that never went out with a message are deleted after a day.</li>
                        <li><strong>Booking a call:</strong> your name, email, the time you picked, your time zone and the reason you gave. It is stored, a Google Calendar event with a Google Meet link is created, and both of us get an email.</li>
                    </ul>

                    <h2>Your browser&apos;s storage</h2>
                    <p>Besides the visit ids above, the site keeps your theme choice and a copy of its own public content in local storage, so it opens fast next time. There are no advertising cookies. Clearing the site&apos;s data in your browser removes all of it.</p>

                    <h2>Services the site uses</h2>
                    <ul>
                        <li><strong>Google Firebase:</strong> the database, file storage and server functions, sign-in for the site owner only, and App Check with reCAPTCHA, which checks that requests come from this site.</li>
                        <li><strong>Google Calendar and Google Meet:</strong> for booked calls.</li>
                        <li><strong>Resend:</strong> sends the emails.</li>
                        <li><strong>GitHub</strong> and a public GitHub contributions service: the code activity shown on the site is read from them by your browser.</li>
                    </ul>
                    <p>Each of these handles data under its own privacy terms. Fonts are served from this site.</p>

                    <h2>Your choices</h2>
                    <p>You can use the site without the forms. To see, correct or delete anything you sent, or to ask what a visit recorded, email <a href={`mailto:${EMAIL}`}>{EMAIL}</a> and it will be handled.</p>

                    <h2>Terms</h2>
                    <ul>
                        <li>The work shown here belongs to its authors and clients. Ask before reusing it.</li>
                        <li>Project links lead to other sites, which have their own terms.</li>
                        <li>The site is offered as it is. Please don&apos;t misuse the forms or try to break the site.</li>
                    </ul>
                    <p className="pv-note">Last updated October 2026.</p>
                </main>
            </div>
        </div>
    );
}
