# Bangla OCR

Free, private Bengali image-to-text conversion — সরাসরি আপনার ব্রাউজারে, কোনো ছবি আপলোড ছাড়াই।

**Live Demo:** https://rafahim.com/bangla-ocr/

## Author

**RA Fahim** — Web Developer & Creator, Full-stack, 1 year experience; Dhaka, Bangladesh.

- Website: https://rafahim.com
- GitHub: https://github.com/rafahim
- Email: dev@rafahim.com
- Twitter: https://twitter.com/rafahimn
- LinkedIn: https://linkedin.com/in/rafahimn

## SEO Checklist

- [x] Page title, description, keywords, and author metadata
- [x] Canonical URL: `https://rafahim.com/bangla-ocr/`
- [x] Open Graph and Twitter summary card metadata
- [x] `twitter:creator` set to `@rafahimn`
- [x] JSON-LD: WebApplication, Person, SoftwareApplication, and BreadcrumbList
- [x] Bengali document language, semantic sections, accessible labels, and image alt text
- [x] `robots.txt`, `sitemap.xml`, `manifest.json`, `humans.txt`, and `.well-known/security.txt`
- [x] SVG favicon and 1200 × 630 Open Graph artwork

**Made in Bangladesh 🇧🇩**

## Features

- Drag and drop, file picker, clipboard image paste, and mobile camera capture
- Bengali, English, or mixed-language OCR through Tesseract.js and traineddata
- Image preview with grayscale, Otsu binarization, deskew, contrast, and invert options
- OCR progress feedback, editable output, and live character, word, and line counts
- Conservative Bengali OCR cleanup, copy, TXT download, and DOCX download
- Sequential batch OCR queue and last-20-results browser history
- Dark mode and responsive Bengali-first interface
- Image processing and OCR happen in the browser. Images are not uploaded to this project.

## Run locally

A small local HTTP server is recommended because browser workers and clipboard APIs may be restricted on `file://` pages. No build step or package installation is needed.

### macOS, Linux, or Windows with Python

```bash
python -m http.server 8000
```

Open `http://localhost:8000` in your browser from the project directory. Internet access is needed initially to load the Tesseract.js library, the Bengali/English language data, and the DOCX library from their CDNs.

### macOS or Linux setup script

```bash
chmod +x setup.sh
./setup.sh
```

### Windows PowerShell setup script

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\setup.ps1
```

Both setup scripts write the app assets and create `bangla-ocr.zip` in the current project directory.

## Usage

1. Add one or more images by dropping them into the upload area, choosing files, pasting an image, or using the camera button on a compatible phone.
2. Select the active image and optional preprocessing settings. Deskew can take longer for large images.
3. Choose Bengali, English, or Bengali + English and start the OCR for the selected image or the pending queue.
4. Review and edit the result. Use the cleanup tool carefully, as OCR corrections should always be checked against the original image.
5. Copy the result or download it as `.txt` or `.docx`. Clear the local history on shared devices.

## Privacy and network behavior

Images are read through the browser File API and processed with Canvas and browser workers. The app does not send image data to a backend. Tesseract.js, its WebAssembly engine, language traineddata, and DOCX support load from public CDNs; those providers may receive normal network request metadata. OCR text is saved to this browser's Local Storage only when a result is generated. Do not use browser history on a shared device for sensitive text.

## Compatibility

Use a modern browser with JavaScript, WebAssembly, Canvas, and Web Workers enabled. Clipboard access depends on browser permissions and usually requires HTTPS or localhost. Mobile camera capture depends on the browser and device. OCR quality depends on image resolution, print quality, font, and language model capabilities.

## License

MIT. See `LICENSE`.
