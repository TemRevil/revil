import type { MetadataRoute } from 'next'

const siteUrl = 'https://temrevil.com'

export const dynamic = 'force-static'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
      // AI Search & Generative Engine bots - explicitly allowed for GEO
      {
        userAgent: 'GPTBot',
        allow: '/',
      },
      {
        userAgent: 'OAI-SearchBot',
        allow: '/',
      },
      {
        userAgent: 'ChatGPT-User',
        allow: '/',
      },
      {
        userAgent: 'ClaudeBot',
        allow: '/',
      },
      {
        userAgent: 'anthropic-ai',
        allow: '/',
      },
      {
        userAgent: 'PerplexityBot',
        allow: '/',
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
      },
      {
        userAgent: 'Google-Extended',
        allow: '/',
      },
      {
        userAgent: 'Bingbot',
        allow: '/',
      },
      {
        userAgent: 'cohere-ai',
        allow: '/',
      },
      // Apple Intelligence / Siri training + search
      {
        userAgent: 'Applebot',
        allow: '/',
      },
      {
        userAgent: 'Applebot-Extended',
        allow: '/',
      },
      // Amazon (Alexa / Rufus / Nova)
      {
        userAgent: 'Amazonbot',
        allow: '/',
      },
      // Meta AI (Llama)
      {
        userAgent: 'Meta-ExternalAgent',
        allow: '/',
      },
      {
        userAgent: 'FacebookBot',
        allow: '/',
      },
      // Common Crawl - feeds many LLM training corpora
      {
        userAgent: 'CCBot',
        allow: '/',
      },
      // ByteDance (TikTok / Doubao)
      {
        userAgent: 'Bytespider',
        allow: '/',
      },
      // Mistral
      {
        userAgent: 'MistralAI-User',
        allow: '/',
      },
      // DuckDuckGo
      {
        userAgent: 'DuckDuckBot',
        allow: '/',
      },
      // Yandex
      {
        userAgent: 'YandexBot',
        allow: '/',
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  }
}
