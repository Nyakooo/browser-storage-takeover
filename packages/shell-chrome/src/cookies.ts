export function cookieId(cookie: chrome.cookies.Cookie) {
  return JSON.stringify([cookie.storeId, cookie.domain, cookie.path, cookie.name, cookie.partitionKey ?? null]);
}

export function matchesHost(cookie: chrome.cookies.Cookie, host: string) {
  const domain = cookie.domain.replace(/^\./, '').toLowerCase();
  return host === domain || (!cookie.hostOnly && host.endsWith(`.${domain}`));
}

function cookieUrl(cookie: chrome.cookies.Cookie) {
  return `${cookie.secure ? 'https' : 'http'}://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
}

export async function cookieContext(sender: chrome.runtime.MessageSender) {
  if (sender.tab?.id === undefined) throw new Error('A website tab is required');
  const stores = await chrome.cookies.getAllCookieStores();
  const store = stores.find(item => item.tabIds.includes(sender.tab!.id!));
  if (!store) throw new Error('Cannot determine this tab’s cookie store');
  return store.id;
}

export async function listCookies(host: string, storeId: string) {
  // An empty partition key includes all partitions; omit it for unpartitioned cookies.
  const [normal, partitioned] = await Promise.all([
    chrome.cookies.getAll({ storeId }),
    chrome.cookies.getAll({ storeId, partitionKey: {} }),
  ]);
  return [...new Map([...normal, ...partitioned].filter(cookie => matchesHost(cookie, host))
    .map(cookie => [cookieId(cookie), { ...cookie, id: cookieId(cookie) }])).values()];
}

function cookieDetails(cookie: chrome.cookies.Cookie, value: string): Parameters<typeof chrome.cookies.set>[0] {
  return {
    url: cookieUrl(cookie), name: cookie.name, value, path: cookie.path,
    ...(cookie.hostOnly ? {} : { domain: cookie.domain }),
    secure: cookie.secure, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite,
    ...(cookie.session ? {} : { expirationDate: cookie.expirationDate }),
    storeId: cookie.storeId, ...(cookie.partitionKey ? { partitionKey: cookie.partitionKey } : {}),
  };
}
export async function updateCookie(cookie: chrome.cookies.Cookie, value: string) {
  const result = await chrome.cookies.set(cookieDetails(cookie, value));
  if (!result) throw new Error('The browser rejected this cookie');
  return result;
}

export async function removeCookie(cookie: chrome.cookies.Cookie) {
  // Expire the exact identity. cookies.remove chooses by URL and can delete a
  // different same-name cookie when host-only and parent-domain paths overlap.
  await chrome.cookies.set({ ...cookieDetails(cookie, cookie.value), expirationDate: 0 });
  const remaining = await chrome.cookies.getAll({ storeId: cookie.storeId, name: cookie.name,
    ...(cookie.partitionKey ? { partitionKey: cookie.partitionKey } : {}) });
  if (remaining.some(item => cookieId(item) === cookieId(cookie))) throw new Error('Cookie was not removed; refresh and retry');
}
