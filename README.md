# Daily Content Limit Extension

A Chrome extension that helps you limit your daily consumption of short-format content on YouTube, Instagram, and TikTok.

## Features

- Set daily limits for short content (YouTube Shorts, Instagram Reels, TikTok videos)
- Track your usage across platforms
- Receive notifications when approaching your limit
- Block content when your daily limit is reached
- Configurable limits per platform or globally

## Installation

1. Clone this repository or download and extract the ZIP file
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the extension directory
5. The extension should now be installed and active

## Icon Generation

The extension includes SVG versions of icons in the `icons/` directory. To generate PNG versions:

1. Open each SVG file in a browser
2. Right-click and select "Save As" 
3. Choose PNG format and save with the same filename but .png extension

Alternatively, you can use the provided `convert-icons.js` script if you have Node.js installed:

```bash
npm install sharp fs-extra
node convert-icons.js
```

## Usage

1. Click the extension icon to open the popup
2. Set your daily limits for content consumption
3. Browse normally - the extension will track your usage
4. When you reach your limit, you'll be redirected to a limit-reached page

## Development

- `popup.html` & `popup.js` - The UI for configuring limits
- `content.js` - Monitors the content you view on supported platforms
- `background.js` - Tracks usage and manages limits
- `limit-reached.html` & `limit-reached.js` - Shown when limits are reached
- `style.css` - Styling for the popup and other components
- `icons/` - Extension icons in various sizes

## License

MIT 