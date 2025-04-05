// This is a Node.js script that can convert SVG to PNG
// To use it, you'll need to install:
// npm install sharp fs-extra

const sharp = require('sharp');
const fs = require('fs-extra');
const path = require('path');

async function convertSvgToPng() {
    try {
        const sizes = [16, 32, 48, 128];

        // Ensure the icons directory exists
        await fs.ensureDir(path.join(__dirname, 'icons'));

        for (const size of sizes) {
            const svgPath = path.join(__dirname, 'icons', `icon${size}.svg`);
            const pngPath = path.join(__dirname, 'icons', `icon${size}.png`);

            if (await fs.pathExists(svgPath)) {
                console.log(`Converting ${svgPath} to PNG...`);

                // Read the SVG file
                const svgBuffer = await fs.readFile(svgPath);

                // Convert SVG to PNG
                await sharp(svgBuffer)
                    .resize(size, size)
                    .png()
                    .toFile(pngPath);

                console.log(`Created ${pngPath}`);
            } else {
                console.warn(`SVG file not found: ${svgPath}`);
            }
        }

        console.log('All icons converted successfully!');
    } catch (error) {
        console.error('Error converting icons:', error);
    }
}

// Run the conversion
convertSvgToPng();

/* 
Alternative: If you don't want to use Node.js, you can also convert the SVGs
to PNGs using online tools like:
- https://svgtopng.com/
- https://convertio.co/svg-png/
- https://cloudconvert.com/svg-to-png

Or you can use browser to render and save them:
1. Open each SVG file in a browser
2. Right-click and select "Save As" 
3. Choose PNG format
*/ 