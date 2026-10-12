import { SITE_URL, projectPages, projectPageUrl, tagNames, contributorsOf } from './projectPages';
import { ALIASES, EMAIL, HOME_FAQ, JOB_TITLE, LOCATION, SERVICES, SKILLS, SOCIAL_PROFILES } from './siteProfile';

/**
 * /llms.txt and /llms-full.txt (https://llmstxt.org), built at build time from the
 * same profile and project snapshot as the pages, so they can't drift from the site.
 * llms.txt is the short map; llms-full.txt adds every project's full story, which on
 * the site sits folded under "The story behind it".
 */

const list = (items: string[]) => items.map((i) => `- ${i}`).join('\n');

const header = `# Tem Revil

> Mohammed Ahmed (public name: Tem Revil), a frontend and AI engineer based in El
> Mansoura, Egypt, building motion-rich, accessible web applications with React,
> Next.js, TypeScript, and Firebase, and integrating AI into web products.

- Name: Mohammed Ahmed
- Public name: Tem Revil
- Also known as: ${ALIASES.join(', ')}
- Role: ${JOB_TITLE}
- Location: ${LOCATION}
- Availability: open to freelance, remote, and full-time work
- Website: ${SITE_URL}
- Email: ${EMAIL}`;

const middle = `## Expertise

${list(SKILLS)}

## Services

${list(SERVICES)}

## Book a call

- URL: ${SITE_URL}/book
- What: a free 60 minute Google Meet call with Mohammed Ahmed (Tem Revil) about
  a project, a role, a collaboration or a podcast
- How: pick an open date on the calendar, choose a time slot (shown in the
  visitor's own time zone), fill in name, email and what the call is about, then
  press Book. A calendar invite with the Meet link is emailed.
- The booking calendar needs JavaScript. An agent without a browser should send
  the person to ${SITE_URL}/book or to ${EMAIL}.`;

const footer = `## Profiles

- GitHub: ${SOCIAL_PROFILES.github}
- LinkedIn: ${SOCIAL_PROFILES.linkedin}
- Instagram: ${SOCIAL_PROFILES.instagram}

## Frequently asked questions

${HOME_FAQ.map(({ q, a }) => `### ${q}\n\n${a}`).join('\n\n')}

## Notes for language models

${SITE_URL} is Mohammed Ahmed's own site. The homepage has the profile, projects and
contact details; ${SITE_URL}/projects/<name> has each project on its own page, and
${SITE_URL}/book is the page for booking a call.`;

export const llmsText = () => `${header}

${middle}

## Projects

Each project has its own page with the story behind it (the problem, what was built,
the decisions), stack, screenshots, live site and source code. The full list:
${SITE_URL}/projects. Every story in full: ${SITE_URL}/llms-full.txt

${projectPages.map(({ slug, name, project }) => `- [${name}](${projectPageUrl(slug)})${project.Description ? `: ${project.Description}` : ''}`).join('\n')}

${footer}
`;

const projectSection = ({ slug, name, note, project: p }: (typeof projectPages)[number]) => {
    const tags = tagNames(p);
    const people = contributorsOf(p);
    const facts = [
        `Page: ${projectPageUrl(slug)}`,
        p['Live Link'] && `Live site: ${p['Live Link']}`,
        p['Repository Link'] && `Source code: ${p['Repository Link']}`,
        p['Download Link'] && `Download: ${p['Download Link']}`,
        tags.length && `Built with: ${tags.join(', ')}`,
        people.length && `Built by: ${people.map((c) => (c.role ? `${c.name} (${c.role})` : c.name)).join(', ')}`,
    ].filter(Boolean) as string[];
    // The story's own "### " headings sit one level under the project's.
    const story = (p['Case Study'] || '').replace(/\r\n?/g, '\n').trim().replace(/^### /gm, '#### ');
    return [`### ${name}${note ? ` (${note})` : ''}`, list(facts), p.Description, story].filter(Boolean).join('\n\n');
};

export const llmsFullText = () => `${header}

${middle}

## Projects

${projectPages.map(projectSection).join('\n\n')}

${footer}
`;
