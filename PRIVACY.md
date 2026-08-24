# Downright — Privacy Policy

*Effective 25 August 2026*

Downright converts the page you are viewing into Markdown, locally, inside your browser.

## What Downright collects

**Nothing.** Downright collects no data of any kind. It has no analytics, no telemetry,
no error reporting, no accounts, and no server — there is no server.

## What Downright can access, and when

- Downright has **no host permissions**. It cannot see any page in the background.
- When — and only when — you invoke it (keyboard shortcut, right-click menu, or the
  toolbar popup), the browser grants it one-time access to the current tab
  (`activeTab`). It reads that page's content, converts it to Markdown on your machine,
  and immediately forgets it.
- The result goes only where you send it: your clipboard (`clipboardWrite`) or a file
  you download.

## Network access

Downright makes **no network requests, ever**. The shipped code contains no
network-capable API calls; an automated audit in the public repository enforces this on
every change.

## What is stored

Your settings (capture mode, front matter fields, filename template) are stored with
your browser's extension-settings sync (`storage.sync`), which your browser vendor may
sync across your own devices as part of your browser profile. Downright itself never
sees this data outside your browser. No page content is ever stored.

## Third parties

None. No data is sold, shared, or transferred to anyone, for any purpose. Downright has
no third-party dependencies.

## Changes

Any change to this policy will appear in this file's public revision history before it
takes effect.

## Contact

Questions: open an issue on the public repository, or email the address on the store
listing.
