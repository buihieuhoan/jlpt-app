const fs = require('fs');
const pdf = require('pdf-parse');

const pdfPath = 'd:\\Zalo Received Files\\JLPT\\N4\\1723004687-ebook-n4-tuvung-tonghop-v2.pdf';
let dataBuffer = fs.readFileSync(pdfPath);

pdf(dataBuffer).then(function(data) {
    fs.writeFileSync('pdf-text.txt', data.text);
    console.log("Extraction complete!");
}).catch(err => {
    console.error("Error reading PDF:", err);
});
