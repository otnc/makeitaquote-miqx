# @makeitaquote/miqx

Generate "Make it a Quote" images through the MiqX API.

[![npm](https://img.shields.io/npm/v/@makeitaquote/miqx)](https://www.npmjs.com/package/@makeitaquote/miqx) [![CI](https://img.shields.io/github/actions/workflow/status/otnc/makeitaquote-miqx/ci.yml?branch=main&label=ci)](https://github.com/otnc/makeitaquote-miqx/actions) [![License](https://img.shields.io/github/license/otnc/makeitaquote-miqx)](LICENSE) [![Node](https://img.shields.io/node/v/@makeitaquote/miqx)](https://www.npmjs.com/package/@makeitaquote/miqx)

Calls the [MiqX API](https://miqx.jp/docs) instead of rendering locally — no native binaries, no fonts, works anywhere Node.js runs.

> [!Note]
>   
> The MiqX API (`https://api.miqx.jp`) is not operated by this package's developer. Please don't open issues here about it being down, and get an API key from the [dashboard](https://miqx.jp/dashboard) before using this package.

> [!Important]
>   
> This package only calls the MiqX API — it does not render images locally. If you want local rendering instead (no network dependency, more control over the theme), use `makeitaquote`: https://github.com/otnc/makeitaquote
>
> ```sh
> npm install makeitaquote
> ```

```sh
npm install @makeitaquote/miqx
```

```ts
import { writeFile } from 'node:fs/promises'
import { MiQX } from '@makeitaquote/miqx'

const miqx = new MiQX({ apiKey: process.env.MIQX_API_KEY! })

const { image } = await miqx
  .setText('吾輩は猫である。名前はまだ無い。')
  .setName('夏目漱石')
  .setId('post0001')
  .setMid('author0001')
  .setIcon('https://example.com/avatar.png')
  .generate()

await writeFile('quote.png', image)
```

CommonJS works too — every entry point ships both `require` and `import`:

```js
const { writeFile } = require('node:fs/promises')
const { MiQX } = require('@makeitaquote/miqx')

const miqx = new MiQX({ apiKey: process.env.MIQX_API_KEY })

miqx
  .setText('吾輩は猫である。名前はまだ無い。')
  .setName('夏目漱石')
  .setId('post0001')
  .setMid('author0001')
  .generate()
  .then(({ image }) => writeFile('quote.png', image))
```

Requires Node.js 18 or newer. On 18 and 20, Node prints an `ExperimentalWarning` about the Fetch API the first time this package runs — harmless, and gone as of Node 21.

---

## Contents

- [Getting an API key](#getting-an-api-key)
- [Discord bots](#discord-bots) — the one thing most people are here for
- [Twitter / X posts](#twitter--x-posts) — including FxTwitter
- [Misskey notes](#misskey-notes)
- [Plain Markdown](#plain-markdown)
- [The request fields](#the-request-fields)
- [`generate()` / `toBuffer()` / `toURL()`](#generate--tobuffer--tourl)
- [Errors](#errors)
- [Author](#author) · [Licence](#licence)

---

## Getting an API key

Every request needs one — sign up and grab it from [miqx.jp/dashboard](https://miqx.jp/dashboard), then pass it to the constructor:

```ts
const miqx = new MiQX({ apiKey: process.env.MIQX_API_KEY! })
```

`hideLogo` (removing the MiqX watermark) and `upload` (getting a hosted URL back) are gated to Basic+ and Starter+ plans respectively — the API ignores or rejects them otherwise.

### API versions

MiqX only has `v1` today, and `MiQX` defaults to it. The option is there so a future `v2` doesn't force a breaking change onto every caller — once one ships, opt in with:

```ts
new MiQX({ apiKey, apiVersion: 'v2' })
```

Everything about `v1` — its request and response shape — lives in one file, `src/v1.ts`; `v2` would get its own alongside it, with `MiQX` dispatching between them by `apiVersion`. Nothing about the fluent builder itself (`setText()`, `setFromMessage()`, …) changes across versions.

---

## Discord bots

```ts
import { AttachmentBuilder } from 'discord.js'
import { MiQX } from '@makeitaquote/miqx'

const miqx = new MiQX({ apiKey: process.env.MIQX_API_KEY! })
const { image } = await miqx.setFromMessage(message).generate()

await message.reply({
  files: [new AttachmentBuilder(image, { name: 'quote.png' })],
})
```

`setFromMessage()` takes the content, name and icon off the message, and uses the message's own id as `id` and the author's id as `mid` — both are Discord snowflakes, so both are already alphanumeric-only. It accepts anything shaped like a Discord message, so discord.js v13, v14 and discord.js-selfbot-v13 all work without this package depending on any of them.

By default it uses what a reader of that server saw — the per-server icon and nickname. Either can be switched to the account-wide version:

```ts
miqx.setFromMessage(message, { avatar: 'global', name: 'global' })
```

| Option | Default | Alternative |
| --- | --- | --- |
| `avatar` | `'guild'` — per-server icon | `'global'` — account avatar |
| `name` | `'nickname'` — server nickname | `'global'` — account name |
| `stripDiscordMarkdown` | `false` — quoted exactly as written | `true` — `**bold**` becomes bold |
| `resolveMentions` | `true` — `<@id>` becomes `@name` | `false` — quoted as the raw token |

Whichever icon or name you choose, the other is still the fallback, so a message with only one of them always renders.

`message.content` normally comes through untouched — `**bold**` is quoted with its asterisks and all, since that is what was actually typed. Opt into plain text with `stripDiscordMarkdown: true`, or call the exported `stripDiscordMarkdown()` yourself on any text.

---

## Twitter / X posts

`setFromTweet()` takes a `TweetLike` — `{ id, text, author: { id, username, name?, avatarUrl? } }`. Nothing in this package fetches one for you; two adapters turn a real API response into that shape first.

**FxTwitter** — no API key, author included inline:

```ts
import { FxTwitterV2 } from 'fxtwitter'
import { fromFxTwitterStatus, MiQX } from '@makeitaquote/miqx'

const { status } = await new FxTwitterV2().getStatus('20')
const { image } = await new MiQX({ apiKey: process.env.MIQX_API_KEY! })
  .setFromTweet(fromFxTwitterStatus(status))
  .generate()
```

**The official API v2** (e.g. via `twitter-api-v2`) — splits a tweet from its author, so request the `author_id` expansion and pass both halves:

```ts
import { TwitterApi } from 'twitter-api-v2'
import { fromTwitterApiV2Tweet, MiQX } from '@makeitaquote/miqx'

const client = new TwitterApi(bearerToken)
const { data: tweet, includes } = await client.v2.singleTweet('20', {
  expansions: ['author_id'],
  'tweet.fields': ['author_id'],
  'user.fields': ['profile_image_url'],
})

const { image } = await new MiQX({ apiKey: process.env.MIQX_API_KEY! })
  .setFromTweet(fromTwitterApiV2Tweet(tweet, includes))
  .generate()
```

The text is quoted exactly as written — X does not expand `t.co` links or `@handle` mentions into anything else in its own timeline either, so there is nothing here to resolve or strip.

---

## Misskey notes

`setFromNote()` takes what the Misskey API returns for a note, unchanged:

```ts
const { image } = await miqx.setFromNote(note).generate()
```

The note's own `id` becomes `id`; `mid` is the author's `id`, qualified with `@host` for a remote author so it stays unique across instances. MFM — Misskey's markup — is stripped by default:

| Option | Default | Alternative |
| --- | --- | --- |
| `stripMfm` | `true` — `$[jelly x]` becomes `x` | `false` — quoted exactly as written |
| `preferCw` | `false` — quotes the note text | `true` — quotes the content warning instead |

A Misskey mention (`@user@host`) is already the readable form in MFM, so unlike Discord there is nothing here to resolve by id.

---

## Plain Markdown

For a source that isn't Discord or Misskey — a blog post, a GitHub comment, a Mastodon toot — but still needs its markup gone before it's quoted, call the exported `stripMarkdown()` yourself and compose it with `setText()`:

```ts
import { MiQX, stripMarkdown } from '@makeitaquote/miqx'

miqx.setText(stripMarkdown('**bold** and a [link](https://example.com)'))
// 'bold and a link'
```

There's no `setFromMarkdown()` — plain CommonMark has no author or avatar to read, so `setText()` plus `setName()`/`setId()`/`setMid()` is already the whole thing. `stripMarkdown()` covers CommonMark plus the common GFM extras (strikethrough, tables, task lists); for Discord's own dialect use `stripDiscordMarkdown()`, and for Misskey's MFM, `stripMfm()`.

---

## The request fields

| Field | Setter | Required | Notes |
| --- | --- | --- | --- |
| `text` | `setText()` | yes | The statement being quoted, up to 4000 characters. |
| `name` | `setName()` | yes | The speaker's display name. |
| `id` | `setId()` | yes | A unique, **alphanumeric-only** id for this message — the API rejects anything else. |
| `mid` | `setMid()` | yes | The speaker's own unique id, kept separate from `id` so the same speaker is recognized across messages. |
| `icon` | `setIcon()` | no | A URL, `Buffer`/`Uint8Array` of PNG or JPG bytes, or `Blob`. A URL is fetched (with a bare, unauthenticated request) before sending — the API key is never sent to whatever host the icon lives on. |
| `param` | `setParam()` | no | Raw custom parameters, passed through as-is. See the [playground](https://miqx.jp/param) for what's currently supported. |
| `hideLogo` | `setHideLogo()` | no | Hides the MiqX watermark. Basic+ plans. |
| `upload` | `setUpload()` | no | Also returns a hosted URL. Starter+ plans. |

`setFromObject()` applies several fields at once from a plain object, validating each one:

```ts
miqx.setFromObject({ text: 'hi', name: 'otoneko.', id: 'msg1', mid: 'user1' })
```

`getData()` returns the current, normalized request; `clone()` copies it into a new builder without sharing state.

---

## `generate()` / `toBuffer()` / `toURL()`

The API always returns the image as base64; `generate()` decodes it and returns `{ image: Buffer, url: string | null }` — `url` is only set when `upload` was enabled.

```ts
const { image, url } = await miqx.setUpload(true).generate()
```

Two convenience methods sit on top of it:

```ts
const image = await miqx.toBuffer() // (await generate()).image
const url = await miqx.toURL() // forces upload for this one call, throws if the plan doesn't support it
```

`toURL()` enables `upload` only for that request — it doesn't change what `setUpload()` left stored, or what a later `generate()`/`toBuffer()` call does.

---

## Errors

Everything thrown extends `MiQError`:

```
MiQError
├─ ValidationError    bad input (carries .field)
└─ MiQXApiError        the API refused or failed (.status, .body, .errorCode, .endpoint)
```

`.errorCode` mirrors the API's own `error_code` (e.g. `VALIDATION_ERROR`, `GENERATION_ERROR`) when the response included one — see the [error codes documented at miqx.jp/docs](https://miqx.jp/docs).

`MiQError`/`ValidationError` come from [`@makeitaquote/utils`](https://www.npmjs.com/package/@makeitaquote/utils), shared with `makeitaquote` and `@makeitaquote/voids` — `instanceof MiQError` catches all three packages' errors once the version you have of each has migrated to it. Only `MiQXApiError` is specific to this package.

```ts
import { MiQXApiError, ValidationError } from '@makeitaquote/miqx'

try {
  await miqx.generate()
} catch (error) {
  if (error instanceof ValidationError) {
    // bad input — error.field says which
  } else if (error instanceof MiQXApiError) {
    // the API said no — error.status, error.errorCode, error.body
  } else {
    throw error
  }
}
```

---

## Author

otoneko. https://github.com/otnc

---

## Licence

MIT — see [LICENSE](LICENSE).

This package makes no local use of fonts or emoji assets; every image is generated by the MiqX API, which is not operated by this project's author.
