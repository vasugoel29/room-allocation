import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filesToVerify = [
  '../src/controllers/promotionController.js',
  '../src/controllers/roomController.js',
  '../src/controllers/timetableController.js',
  '../src/controllers/uploadController.js',
  '../src/db.js',
  '../src/repositories/bookingRepository.js',
  '../src/repositories/promotionRepository.js',
  '../src/repositories/roomRepository.js',
  '../src/repositories/transferRepository.js',
  '../src/repositories/userRepository.js',
  '../src/services/bookingService.js',
  '../src/services/transferService.js'
];

console.log('Verifying JS syntax correctness for refactored files...');
let hasErrors = false;

for (const fileRel of filesToVerify) {
  const filePath = path.resolve(__dirname, fileRel);
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    // Using Script compilation to check syntax
    new vm.Script(code, { filename: path.basename(filePath) });
    console.log(`✓ Syntax OK: ${path.basename(filePath)}`);
  } catch (err) {
    console.error(`✗ Syntax ERROR in ${path.basename(filePath)}:`, err.message);
    hasErrors = true;
  }
}

if (hasErrors) {
  console.log('Verification completed with errors.');
  process.exit(1);
} else {
  console.log('All files verified successfully! Syntax is 100% correct.');
}
