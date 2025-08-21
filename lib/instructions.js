import fs from 'fs';
import path from 'path';

// Function to read and process CSV files from the data folder
const readCSVFiles = () => {
    const dataFolderPath = path.join(process.cwd(), 'data');
    let csvData = '';
    
    try {
        // Check if data folder exists
        if (!fs.existsSync(dataFolderPath)) {
            console.log('Data folder not found');
            return '';
        }
        
        // Read all CSV files in the data folder
        const files = fs.readdirSync(dataFolderPath);
        const csvFiles = files.filter(file => file.endsWith('.csv'));
        
        if (csvFiles.length === 0) {
            console.log('No CSV files found in data folder');
            return '';
        }
        
        csvData = '=== MINDLER ASSESSMENT DATA ===\n\n';
        
        console.log(`Loading ${csvFiles.length} CSV files from data folder:`, csvFiles);
        
        csvFiles.forEach(file => {
            try {
                const filePath = path.join(dataFolderPath, file);
                const content = fs.readFileSync(filePath, 'utf8');
                
                // Basic validation - check if content is not empty
                if (content.trim()) {
                    csvData += `--- ${file} ---\n${content}\n\n`;
                    console.log(`Successfully loaded: ${file}`);
                } else {
                    console.warn(`Skipping empty file: ${file}`);
                }
            } catch (error) {
                console.error(`Error reading file ${file}:`, error);
            }
        });
        
        return csvData;
    } catch (error) {
        console.error('Error reading CSV files:', error);
        return '';
    }
};

const generateSystemInstructions = (pdfContext = '') => {
    const baseInstructions = `You are a helpful assistant specialized in Mindler assessments and career guidance. You can help with general questions and provide detailed information about Mindler's assessment tools and career decision-making processes.`;
    
    // Read CSV data from the data folder
    const csvData = readCSVFiles();
    
    let fullInstructions = baseInstructions;
    
    // Add CSV data if available
    if (csvData && csvData.trim()) {
        fullInstructions += `\n\nYou have access to comprehensive Mindler assessment data including:\n- Assessment types and dimensions\n- Question counts and sections\n- Score interpretation guidelines\n- Career guidance information\n- Personality, aptitude, interest, and EQ assessment data\n\nDetailed data:\n${csvData}`;
    }
    
    // Add PDF context if available
    if (pdfContext && pdfContext.trim()) {
        fullInstructions += `\n\nAdditional PDF Context:\n${pdfContext}`;
    }
    
    fullInstructions += `\n\nPlease use this information to provide accurate and helpful responses about Mindler assessments, career guidance, and any related questions.`;
    
    return fullInstructions;
};

export default generateSystemInstructions;