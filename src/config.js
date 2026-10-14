// Tüm ayarlar ortam değişkenlerinden (GitHub Secrets / Variables) okunur.
const env = process.env;

export const config = {
  ikas: {
    clientId: env.IKAS_CLIENT_ID,
    clientSecret: env.IKAS_CLIENT_SECRET,
    tokenUrl: env.IKAS_TOKEN_URL || 'https://api.myikas.com/api/admin/oauth/token',
    graphqlUrl: env.IKAS_GRAPHQL_URL || 'https://api.myikas.com/api/v2/admin/graphql',
    merchantId: env.IKAS_MERCHANT_ID || '35cfc9ba-3ff2-4634-9513-0419bc8d77fb',
  },
  store: {
    siteUrl: env.SITE_URL || 'https://soydasmotosiklet.com',
    storefrontId: env.IKAS_STOREFRONT_ID || '87bfcc82-f6a1-4bf3-b16a-8afeee39e122',
    categoryId: env.IKAS_BLOG_CATEGORY_ID || 'a620b2b5-801d-4582-ac06-f7800565ac76', // Motosiklet Rehberleri
    writerFirstName: env.BLOG_WRITER_FIRST || 'Soydaş',
    writerLastName: env.BLOG_WRITER_LAST || 'Motosiklet',
    brand: 'Soydaş Motosiklet',
  },
  claude: {
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.CLAUDE_MODEL || '', // boşsa en yeni Sonnet modeli otomatik seçilir
    webSearch: (env.CLAUDE_WEB_SEARCH || 'true') !== 'false',
  },
  unsplash: {
    accessKey: env.UNSPLASH_ACCESS_KEY,
    appName: env.UNSPLASH_APP_NAME || 'soydas_blog_bot',
  },
  coverStyle: env.COVER_STYLE || 'framed', // 'framed' (koyu zemin + ortalanmış foto) | 'full'
};
