import fs from 'fs';
import { createRequire } from 'module';

// Custom PDF parser wrapper with fallback options
export async function parsePDF(filePath) {
    try {
        // First try using pdf-parse with require
        try {
            const require = createRequire(import.meta.url);
            const pdfParse = require('pdf-parse');
            
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            return data.text;
        } catch (pdfParseError) {
            console.log('pdf-parse failed, trying pdfjs-dist...');
            
            // Fallback to pdfjs-dist with legacy build for Node.js
            const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');
            
            // For Node.js environment, we need to disable the worker
            pdfjsLib.GlobalWorkerOptions.workerSrc = false;
            
            const dataBuffer = fs.readFileSync(filePath);
            const pdf = await pdfjsLib.getDocument({ 
                data: dataBuffer,
                useWorkerFetch: false,
                isEvalSupported: false,
                useSystemFonts: true
            }).promise;
            
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\n';
            }
            
            return fullText;
        }
    } catch (error) {
        console.error('Error parsing PDF:', error);
        throw new Error(`Failed to parse PDF: ${error.message}`);
    }
}
