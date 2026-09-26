# Privacy Policy

Last updated: 2026-09-26

Takeover browser storage lets a user inspect and edit storage for the website open in the current tab.

## Data handled by the extension

When a user opens the panel, the extension processes the current site's Local Storage, Session Storage, page-readable Cookies, and IndexedDB locally in the browser to display and edit those entries. These entries may contain website content or authentication information, depending on the site. The extension also uses the current site's origin to scope storage operations. The extension does not transmit this data or the current site's origin to the developer or a developer-operated server. The data remains in the browser and in the website's own storage.

The extension cannot read HttpOnly Cookies. Cookie operations are limited to page-readable cookies available in the current website context. IndexedDB editing uses JSON and may not preserve special structured-clone values that cannot be represented as JSON.

## Permissions

The extension requests website access so its content script can provide the user-invoked panel on the site in the current tab and access that site's storage for the storage inspection and editing purpose. The extension does not use remote code or send storage data to a developer server. Data is used only for the extension's disclosed storage inspection and editing features, is not sold, and is not shared with third parties.

## Changes to this policy

If the extension's data practices change, this policy will be updated before the change is released.

## Contact

For questions or support, use the [project issue tracker](https://github.com/Nyakooo/browser-storage-takeover/issues).
