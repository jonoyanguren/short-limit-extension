# Daily Content Limit

A browser extension that helps you limit the time you spend consuming short-format content on social media platforms.

## Description

Daily Content Limit is a Chrome extension that allows you to set daily limits on how many short-format videos you can watch on YouTube Shorts, Instagram Reels, and TikTok. The extension was developed over a weekend with the help of AI to create a tool that promotes healthier social media usage habits.

The extension:
- Tracks your consumption of short-format content across platforms
- Lets you set custom daily limits
- Shows a friendly reminder when you've reached your limit
- Resets automatically at midnight every day

This project aims to help people regain control over their social media usage by limiting the endless scrolling of addictive short-format content.

## Technologies Used

- JavaScript (vanilla)
- Chrome Extension APIs
- HTML/CSS for the user interface
- Content script and background script architecture
- Local storage for saving user preferences

No external libraries or frameworks were used to keep the extension lightweight and fast.

## Features

- **Cross-platform tracking**: Works across YouTube, Instagram, and TikTok
- **Customizable limits**: Set different limits for each platform or the same for all
- **Minimalist UI**: Clean interface that's easy to understand
- **Non-intrusive**: Only activates when viewing short-format content
- **Privacy-focused**: All data is stored locally on your device

## How It Works

The extension uses content scripts to detect when you're viewing short-format content on the supported platforms. It counts each video you watch and compares it to your daily limit. When you reach your limit, it redirects you to a friendly limit-reached page that shows how much time is left until your counter resets.

## Installation

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the extension directory

## Development

This extension was developed over a weekend with the assistance of AI tools to speed up the development process. The core functionality was designed to be lightweight and modular to make future updates and improvements easier.

## Future Plans

- Support for more platforms
- Analytics to show usage patterns
- Time-based limits in addition to content-count limits
- Dark mode support

## Contact

- Developer: Jon Oyanguren
- Email: jonoyanguren@gmail.com
- Website: [jonoyanguren.com](https://jonoyanguren.com)

Feel free to contribute to this project or reach out with suggestions for improvements!

## License

MIT 