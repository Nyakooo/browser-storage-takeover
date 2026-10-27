# Privacy Policy

Last updated: 2026-10-27

Takeover browser storage lets a user inspect and edit storage for the website open in the current tab.

## Data handled by the extension

When a user opens the panel, the extension processes the current site's Local Storage, Session Storage, Cookies (including HttpOnly, Secure, path-scoped and partitioned cookies), and IndexedDB locally in the browser to display and edit those entries. These entries may contain website content or authentication information, depending on the site. The extension also uses the current site's origin to scope storage operations. The extension does not transmit this data or the current site's origin to the developer or a developer-operated server. The data remains in the browser and in the website's own storage.

Cookie operations use the browser extension API and are scoped to the selected frame’s hostname, applicable parent-domain cookies, and the tab’s cookie store. All accessible partition keys for matching cookies are displayed. Shared parent-domain cookies can affect other subdomains. Web Storage and IndexedDB operations run in the selected frame’s origin and browser storage partition; Session Storage also follows the tab’s session context. Non-JSON IndexedDB values are read-only to prevent lossy edits.

## Permissions

The extension requests the cookies permission to manage complete cookie records and the webNavigation permission to enumerate frames in the current tab for explicit origin selection. Frame URLs are processed locally to route operations, are not uploaded, and are not collected as browsing history. The extension requests website access so its content script can provide the user-invoked panel on the site in the current tab and access that site's storage for the storage inspection and editing purpose. The extension does not use remote code or send storage data to a developer server. Data is used only for the extension's disclosed storage inspection and editing features, is not sold, and is not shared with third parties.

## Changes to this policy

If the extension's data practices change, this policy will be updated before the change is released.

## Contact

For questions or support, use the [project issue tracker](https://github.com/Nyakooo/browser-storage-takeover/issues).
