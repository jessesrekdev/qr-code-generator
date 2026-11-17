# Open QR Studio

A modern, responsive QR code generator and public QR image API, built with React, TypeScript, Vite and Netlify Functions.

**Live app:** https://open-qr-studio.netlify.app  
**API documentation:** https://open-qr-studio.netlify.app/docs  
**QR image endpoint:** https://open-qr-studio.netlify.app/create

## Features

- Dashboard and interactive QR Studio
- Seven content types: URL, text, Wi-Fi, email, phone, SMS and vCard/contact
- Live QR preview with colors, gradients, dot/corner styles and optional logo
- PNG and SVG downloads
- Saved projects in a browser-local library, including reopening and editing
- Dark/light mode and responsive mobile/desktop interface
- Public GET API that produces SVG, PNG or JPG QR images without an API key

## Use the web app

Visit **https://open-qr-studio.netlify.app**, open **Studio**, choose a content type, enter the information to encode, customize your design, and download the QR code. Save projects in **Library** to edit them later. Saved projects stay in the current browser's local storage; they do not sync across devices.

## QR image API

Send a GET request to `/create` with a required `q` query parameter. The response is an **image**, not JSON or HTML. By default it returns SVG (`image/svg+xml`). Set `format=png` for PNG (`image/png`) or `format=jpg` for JPEG (`image/jpeg`). The aliases `format=jpeg`, `type=png`, and bare flags `_png`, `_jpg`, `_svg` are also supported.

### Quick start

[Generate a QR code for example.com](https://open-qr-studio.netlify.app/create?q=https%3A%2F%2Fexample.com)

```text
GET https://open-qr-studio.netlify.app/create?q=https%3A%2F%2Fexample.com
```

To customize its appearance:

```text
https://open-qr-studio.netlify.app/create?q=Hello%20World&foreground=%231463e8&background=%23ffffff&dots=rounded&size=400&margin=4
```

**Important:** URL-encode the content in `q`. Encode the `#` in hex colors as `%23`; otherwise the browser treats it as a URL fragment and does not send it to the API. Separate parameters with `&` (not underscores).

### Query parameters

| Parameter | Required | Default | Description |
| --- | --- | --- | --- |
| `format` or `type` | No | `svg` | `svg`, `png`, `jpg` (or `jpeg`); `_svg`, `_png`, `_jpg` flags also work |
| `q` | Yes | — | Text or URL to encode; up to 2,200 UTF-8 bytes |
| `foreground` or `fg` | No | `#151a35` | Foreground hex color |
| `background` or `bg` | No | `#ffffff` | Background hex color |
| `dots` | No | `rounded` | `square`, `rounded` or `dots` |
| `size` | No | `320` | SVG width/height in pixels, integer 96–1200 |
| `margin` | No | `4` | Quiet-zone width in QR modules, integer 0–12 |
| `gradient` | No | `false` | Set to `true` to enable a gradient |
| `second` | No | `#1463e8` | Second gradient color when enabled |

Colors accept `#RGB` or `#RRGGBB`.

### Choose the image format

```text
https://open-qr-studio.netlify.app/create?q=Hello&format=svg
https://open-qr-studio.netlify.app/create?q=Hello&format=png
https://open-qr-studio.netlify.app/create?q=Hello&format=jpg
```

You can also append `&_png`, `&_jpg`, or `&_svg` to the URL. Without a format option, the API returns SVG. JPG uses an opaque background; PNG and SVG preserve the requested design.

### Code examples

**HTML — embed a QR image**

```html
<img
  src="https://open-qr-studio.netlify.app/create?q=Hello%20World&size=320"
  alt="QR code for Hello World"
  width="320"
  height="320"
/>
```

**JavaScript — generate a URL with encoded parameters**

```js
const api = new URL('https://open-qr-studio.netlify.app/create');
api.searchParams.set('q', 'https://example.com');
api.searchParams.set('foreground', '#1463e8');
api.searchParams.set('dots', 'rounded');
api.searchParams.set('size', '400');

const qrImageUrl = api.toString();
document.querySelector('#qr').src = qrImageUrl;
```

HTML element for the JavaScript example: `<img id="qr" alt="Generated QR code">`.

**Python — save the SVG response**

```python
import requests

url = 'https://open-qr-studio.netlify.app/create'
response = requests.get(url, params={
    'q': 'https://example.com',
    'foreground': '#1463e8',
    'size': 400,
})
response.raise_for_status()

with open('qr.svg', 'wb') as file:
    file.write(response.content)
```

**cURL — download an SVG**

```bash
curl --get 'https://open-qr-studio.netlify.app/create' \
  --data-urlencode 'q=https://example.com' \
  --data-urlencode 'foreground=#1463e8' \
  --data-urlencode 'size=400' \
  --output qr.svg
```

### Responses and limits

- `200 OK` — SVG, PNG or JPEG image with the corresponding `Content-Type`.
- `400 Bad Request` — missing `q`, invalid styling parameter, or unencodable content.
- `413 Content Too Large` — QR content exceeds 2,200 UTF-8 bytes.
- `405 Method Not Allowed` — method other than GET or HEAD.
- Successful responses are publicly cacheable for up to 5 minutes.

No API key is required. The API does not store submitted QR content, but **query strings can be visible in browser history, access logs, caches and referrer data**. Do not put passwords, tokens or other secrets into the `q` parameter. For long content, keep QR scannability in mind.

## Run locally

```bash
npm install
npm run dev
```

Build the React app:

```bash
npm run build
```

The frontend builds to `dist/`. The public `/create` endpoint is implemented in `netlify/functions/create.mjs` and requires a Netlify-compatible Functions runtime; serving `dist/` alone will **not** run the API. Netlify deployment configuration is in `netlify.toml`.

## Security and privacy

The original public HTML contained an embedded Telegram bot token and silently sent generated QR images to a Telegram chat. This redesign removes that behavior. Any previously exposed token should be revoked/rotated using BotFather, since removing it from this branch does not erase historical Git commits.

Studio QR generation runs in the browser. Library designs are stored in `localStorage`, including uploaded logos as data URLs, and are not synchronized across devices. Test styled QR codes with a scanner before printing or sharing.

## Tech stack

React 19 · TypeScript · Vite · React Router · Lucide React · qr-code-styling · qrcode · Netlify Functions
