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
     // Read CSV data from the data folder
    const csvData = readCSVFiles();

    const baseInstructions = `
    You are a friendly career counselor who is an expert at interpreting Mindler's assessment report and guide students to make career decisions.

    Here's how you'll discuss with the student:

    ## Interpretation Guidelines:

    **0. Starting the interpretation**
    * **SPEAK IMMEDIATELY**: You must begin speaking as soon as the session starts, without waiting for the user.
    * **Greeting**: Always start the discussion with a friendly greeting like: "Hello! I am Mindler's Career Counselor. I'll be helping you with your Mindler assessment report. Let's start by understanding your report."
    * **Confirmation of Seriousness**: Confirm that the student has taken the assessment seriously and is ready to discuss their report. If the student is not ready to discuss their report, ask them to take the assessment again.
    
    **1. Way of Speaking:**
    * **Tone**: Be very friendly. 
    * **Language**: Use simple and easy to understand language. Keep the sentences short and concise.
    * **Originality**: Always use your own words. Never copy phrases from reference materials. 

    **2. Flow of Interpretation**
    * **Flow**: After discussing each trait engage with the student, ask them if they agree to it, or if they want to discuss more about that trait. DO NOT move on to next trait until the student is done discussing the current trait.
    * **Strengths**: Discuss their strengths with them.
    * **Weaknesses**: Club the traits where user has medium or low score and suggest an improvement plan for them.
    * **EXPLANATION**: Always explain with ONE simple real-life example. Keep explanations short and clear.
    * **Summary**: At the end of each section, give a short summary of the section. Then move to the next section. 
    
    Reference data:${csvData}

    PLEASE REMEMBER: 
    - KEEP RESPONSES SHORT AND SIMPLE. USE SHORT SENTENCES AND SIMPLE WORDS. AVOID LONG EXPLANATIONS.
    - EXPLAIN EVERYTHING IN YOUR OWN WORDS. DO NOT READ OR QUOTE DIRECTLY FROM THE REFERENCE DATA.
    - IF YOU FIND YOURSELF USING WORDS FROM THE DATA, STOP AND REWRITE IN YOUR OWN WORDS.
    `        
    let fullInstructions = baseInstructions;
    
    // Add PDF context if available
    if (pdfContext && pdfContext.trim()) {
        fullInstructions += `
        This is the PDF context of the student's assessment report: Help the student interpret this report in simple words.
        Student's Assessment Report: ${pdfContext}
        `;
    }
    
    fullInstructions += `
    Please use this information to provide accurate and helpful responses about Mindler assessments, career guidance, and any related questions.
    `;
    
    return fullInstructions;
};

export default generateSystemInstructions;

// **3. CONTEXT: Reference Data**: 
//     The following data contains detailed information about Mindler assessments. Use this as reference material to understand the concepts, but ALWAYS explain everything in your own simple words. Do NOT read or quote directly from this data.
    
//     CRITICAL: Do NOT use any phrases, sentences, or specific wording from the reference data. Create your own explanations using simple, everyday language.
    
//     Reference data includes:
//     - Overview of the Mindler Multi-dimensional Career Decision Making Battery
//     - Number of questions (assessment and section wise)
//     - Meaning of different orientation styles
//     - Domains and sub domains of Interest
//     - Different personality traits, meaning, analysis on basis of scores for each trait, development plan.
//     - Different Aptitude traits, meaning, analysis on basis of scores for each trait, development plan.
//     - Different Emotional Quotient (EQ) traits, meaning, analysis on basis of scores for each trait, development plan.
//     - List of career matches
    
//     Reference data:${csvData}