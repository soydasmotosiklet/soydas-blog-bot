// ikas Admin API istemcisi (Özel Uygulama / client_credentials).
import { config } from './config.js';

let cachedToken = null;

export async function getToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const { clientId, clientSecret, tokenUrl } = config.ikas;
  if (!clientId || !clientSecret) throw new Error('IKAS_CLIENT_ID / IKAS_CLIENT_SECRET tanımlı değil.');
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(`ikas token alınamadı (HTTP ${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

export async function gql(query, variables = {}, opName) {
  const token = await getToken();
  const url = config.ikas.graphqlUrl + (opName ? `?op=${opName}` : '');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors) {
    throw new Error(`ikas GraphQL hatası (${opName || 'query'}, HTTP ${res.status}): ${JSON.stringify(json.errors || json).slice(0, 600)}`);
  }
  return json.data;
}

export async function introspect() {
  const data = await gql(`query { __schema { queryType { fields { name } } mutationType { fields { name } } } }`, {}, 'introspection');
  return {
    queries: data.__schema.queryType.fields.map((f) => f.name),
    mutations: (data.__schema.mutationType?.fields || []).map((f) => f.name),
  };
}

export async function describeType(name) {
  const data = await gql(
    `query($n:String!){ __type(name:$n){ name kind inputFields { name type { name kind ofType { name kind } } } fields { name type { name kind ofType { name kind } } } } }`,
    { n: name },
    'introspectType',
  );
  return data.__type;
}

export async function listBlogs() {
  const data = await gql(
    `query listBlog($pagination: PaginationInput) { listBlog(pagination: $pagination) { data { id title imageId metadata { slug } } } }`,
    { pagination: { page: 1, limit: 200 } },
    'listBlog',
  );
  return data.listBlog.data || [];
}

export async function uploadImage(buffer) {
  const imageId = crypto.randomUUID();
  const data = await gql(
    `query getImageUploadUrl($imageDir: String, $imageId: String!) { getImageUploadUrl(imageDir: $imageDir, imageId: $imageId) }`,
    { imageId },
    'getImageUploadUrl',
  );
  const putUrl = data.getImageUploadUrl;
  if (!putUrl) throw new Error('getImageUploadUrl boş döndü');
  const put = await fetch(putUrl, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: buffer });
  if (!put.ok) throw new Error(`Görsel yüklenemedi (HTTP ${put.status})`);
  // ikas görseli işleyip CDN'e koyana kadar bekle
  const url = cdnUrl(imageId);
  for (let i = 0; i < 20; i++) {
    const r = await fetch(url, { method: 'HEAD' }).catch(() => null);
    if (r && r.ok) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return imageId;
}

export const cdnUrl = (imageId) => `https://cdn.myikas.com/images/${config.ikas.merchantId}/${imageId}/image_1080.webp`;

export async function checkSlug(slug) {
  try {
    const data = await gql(
      `query checkBlogMetaDataSlug($slug: String!) { checkBlogMetaDataSlug(slug: $slug) { id slug } }`,
      { slug },
      'checkBlogMetaDataSlug',
    );
    return data.checkBlogMetaDataSlug; // null => slug boşta
  } catch (e) {
    return null;
  }
}

export async function saveBlog(input) {
  const data = await gql(
    `mutation saveBlog($input: BlogInput!) { saveBlog(input: $input) { id } }`,
    { input },
    'saveBlog',
  );
  return data.saveBlog.id;
}

export function buildBlogInput(draft) {
  const s = config.store;
  return {
    title: draft.title,
    shortDescription: draft.shortDescription,
    imageId: draft.coverImageId,
    categoryId: s.categoryId,
    isPublished: true,
    locale: 'tr',
    storefrontId: s.storefrontId,
    tagIds: null,
    publishedAt: null,
    deleted: false,
    writer: { firstName: s.writerFirstName, lastName: s.writerLastName },
    blogContent: { content: draft.contentHtml, contentData: draft.contentData, contentSource: null, deleted: false },
    metadata: {
      slug: draft.slug,
      pageTitle: draft.seoTitle,
      description: draft.seoDescription,
      canonicals: null,
      disableIndex: null,
      targetType: 'BLOG',
      deleted: false,
    },
  };
}
