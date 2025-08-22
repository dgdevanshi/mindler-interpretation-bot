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
            
            // Fallback to pdfjs-dist
            const pdfjsLib = await import('pdfjs-dist');
            
            // Set up the worker
            const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.mjs');
            pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
            
            const dataBuffer = fs.readFileSync(filePath);
            const pdf = await pdfjsLib.getDocument({ data: dataBuffer }).promise;
            
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
        throw error;
    }
}
